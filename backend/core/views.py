# core/views.py
import logging
from threading import Thread
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core import signing
from django.db import transaction as db_transaction
from django.db.models import Sum

from rest_framework import viewsets, mixins, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from jsonschema import validate, ValidationError

from .models import (
    Station, Pump, Transaction, Receipt, Rule,
    Anomaly, Tank, TankReading, AuditLog
)
from .serializers import (
    StationSerializer,
    PumpSerializer,
    TransactionSerializer,
    TransactionCreateSerializer,
    ReceiptSerializer,
    ReceiptCreateSerializer,
    RuleSerializer,
    GenerateReceiptSerializer,
    VerifyReceiptSerializer,
    AnomalySerializer,
    TankSerializer,
    TankReadingSerializer,
)
from .permissions import IsAttendantOrOwner, IsAdminOrOwner
from .tasks import send_receipt_sms, reconcile_tank_sales

logger = logging.getLogger(__name__)


# ---------------------------
# Helper background worker
# ---------------------------
def _async_post_tx_work(tx_id):
    """
    Background worker: create receipt if needed and do any post-processing.
    """
    try:
        tx = Transaction.objects.select_related("receipt").get(pk=tx_id)
    except Transaction.DoesNotExist:
        logger.error("async_post_tx_work: Transaction %s not found", tx_id)
        return

    try:
        if not hasattr(tx, "receipt") or tx.receipt is None:
            Receipt.objects.create(transaction=tx)
            logger.info("async_post_tx_work: created receipt for tx %s", tx_id)
    except Exception:
        logger.exception("async_post_tx_work: failed to create receipt for tx %s", tx_id)


# ---------------------------
# Transaction create / detail
# ---------------------------
class TransactionCreateView(APIView):
    """
    Create a transaction quickly; offload slow follow-ups to background thread.
    """
    permission_classes = [IsAuthenticated]  # optionally add IsAttendantOrOwner

    def post(self, request):
        start = timezone.now()
        data = dict(request.data or {})

        # default attendant to request.user if missing
        if not data.get("attendant") and request.user and request.user.is_authenticated:
            data["attendant"] = str(getattr(request.user, "id"))

        serializer = TransactionCreateSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        try:
            tx = serializer.save()
        except Exception:
            logger.exception("TransactionCreateView: error saving transaction")
            return Response({"detail": "Failed to create transaction"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # start background thread for non-blocking post work
        try:
            t = Thread(target=_async_post_tx_work, args=(tx.id,), daemon=True)
            t.start()
        except Exception:
            logger.exception("TransactionCreateView: failed to start background job for tx %s", tx.id)

        receipt_token = None
        try:
            if hasattr(tx, "receipt") and tx.receipt:
                receipt_token = tx.receipt.receipt_token
        except Exception:
            receipt_token = None

        elapsed_ms = int((timezone.now() - start).total_seconds() * 1000)
        logger.info("TransactionCreateView: created tx %s in %sms", tx.id, elapsed_ms)

        return Response({"transaction_id": str(tx.id), "receipt_token": receipt_token}, status=status.HTTP_201_CREATED)


class TransactionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        tx = get_object_or_404(Transaction, pk=pk)
        serializer = TransactionSerializer(tx)
        return Response(serializer.data)


# ---------------------------
# Receipt endpoints
# ---------------------------
class ReceiptListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tx_id = request.query_params.get("transaction")
        qs = Receipt.objects.all().order_by("-issued_at")
        if tx_id:
            qs = qs.filter(transaction__id=tx_id)
        serializer = ReceiptSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ReceiptCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        receipt = serializer.save()
        out = ReceiptSerializer(receipt)
        return Response(out.data, status=status.HTTP_201_CREATED)


class GenerateReceiptAPIView(APIView):
    permission_classes = [IsAttendantOrOwner]

    def post(self, request):
        serializer = GenerateReceiptSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        tx_id = serializer.validated_data["transaction_id"]
        tx = get_object_or_404(Transaction, pk=tx_id)
        if hasattr(tx, "receipt") and tx.receipt:
            return Response(ReceiptSerializer(tx.receipt).data, status=status.HTTP_200_OK)
        receipt = Receipt.objects.create(transaction=tx)
        return Response(ReceiptSerializer(receipt).data, status=status.HTTP_201_CREATED)


class VerifyReceiptAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["receipt_token"]
        ok, result = Receipt.verify_token(token)
        if not ok:
            return Response({"valid": False, "reason": result}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"valid": True, "receipt": ReceiptSerializer(result).data}, status=status.HTTP_200_OK)


class ReceiptVerifyView(APIView):
    """
    Backwards-compatible GET /receipts/<token>/verify/
    Token is signing payload produced when receipt created.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        try:
            from django.conf import settings as _settings
            data = signing.loads(token, key=_settings.SECRET_KEY)
        except Exception:
            try:
                # fallback: attempt plain loads
                data = signing.loads(token)
            except Exception:
                return Response({"valid": False, "reason": "invalid token"}, status=status.HTTP_400_BAD_REQUEST)

        tx_id = data.get("transaction_id")
        if not tx_id:
            return Response({"valid": False, "reason": "token missing transaction_id"}, status=status.HTTP_400_BAD_REQUEST)
        tx = get_object_or_404(Transaction, id=tx_id)
        tx_ser = TransactionSerializer(tx)
        return Response({"valid": True, "transaction": tx_ser.data})


# ---------------------------
# Event ingestion (external)
# ---------------------------
TRANSACTION_SCHEMA = {
    "type": "object",
    "required": ["event_type", "station_id", "pump_id", "timestamp", "volume_l", "unit_price", "external_id"],
    "properties": {
        "event_type": {"const": "transaction.created"},
        "external_id": {"type": "string"},
        "station_id": {"type": "string"},
        "pump_id": {"type": "string"},
        "attendant_id": {"type": "string"},
        "timestamp": {"type": "string"},
        "volume_l": {"type": "number"},
        "unit_price": {"type": "number"},
        "total_amount": {"type": "number"},
        "raw_event": {"type": "object"},
    },
}


class EventIngestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        payload = request.data
        try:
            validate(instance=payload, schema=TRANSACTION_SCHEMA)
        except ValidationError as e:
            return Response({"error": "invalid payload", "detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve station and pump
        try:
            station = Station.objects.get(id=payload["station_id"])
        except Station.DoesNotExist:
            return Response({"error": "unknown station"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pump = Pump.objects.get(id=payload["pump_id"])
        except Pump.DoesNotExist:
            return Response({"error": "unknown pump"}, status=status.HTTP_400_BAD_REQUEST)

        data = {
            "station": str(station.id),
            "pump": str(pump.id),
            "attendant": payload.get("attendant_id"),
            "timestamp": payload.get("timestamp"),
            "volume_l": payload.get("volume_l"),
            "unit_price": payload.get("unit_price"),
            "total_amount": payload.get("total_amount", payload.get("volume_l") * payload.get("unit_price")),
            "raw_event": payload.get("raw_event", {}),
            "external_id": payload.get("external_id"),
        }

        serializer = TransactionCreateSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        tx = serializer.save()

        receipt_token = None
        try:
            if hasattr(tx, "receipt") and tx.receipt:
                receipt_token = tx.receipt.receipt_token
        except Exception:
            receipt_token = None

        return Response({"transaction_id": str(tx.id), "receipt_token": receipt_token}, status=status.HTTP_201_CREATED)


# ---------------------------
# Pump, Rule, Receipt viewsets
# ---------------------------
class PumpViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Pump.objects.all()
    serializer_class = PumpSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated])
    def transactions(self, request, pk=None):
        """
        GET /api/v1/pumps/<pk>/transactions/?page_size=10
        Returns recent transactions for the pump (descending by timestamp).
        """
        pump = self.get_object()
        try:
            page_size = int(request.query_params.get("page_size", 10))
        except Exception:
            page_size = 10
        tx_qs = Transaction.objects.filter(pump=pump).order_by("-timestamp")[:page_size]
        serializer = TransactionSerializer(tx_qs, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def heartbeat(self, request, pk=None):
        """
        POST /api/v1/pumps/<pk>/heartbeat/
        Body (optional): { "force_online": true }  -> will set pump.status='online'
        Updates last_heartbeat timestamp and returns serialized pump.
        """
        pump = self.get_object()
        force_online = bool(request.data.get("force_online", False))
        try:
            pump.mark_heartbeat(when=timezone.now(), save=False)
            if force_online:
                pump.status = "online"
            pump.save(update_fields=["last_heartbeat", "updated_at", "status"])
        except Exception:
            logger.exception("Failed to update heartbeat for pump %s", pump.id)
            return Response({"ok": False, "detail": "failed to update heartbeat"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = PumpSerializer(pump, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class RuleViewSet(viewsets.ModelViewSet):
    queryset = Rule.objects.all().order_by("-created_at")
    serializer_class = RuleSerializer
    permission_classes = [IsAuthenticated, IsAdminOrOwner]


class ReceiptViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Receipt.objects.all().order_by("-issued_at")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return ReceiptCreateSerializer
        return ReceiptSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        tx = self.request.query_params.get("transaction")
        if tx:
            qs = qs.filter(transaction__id=tx)
        return qs


# ---------------------------
# Tank endpoints
# ---------------------------
class TankViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Tank.objects.all().order_by("-id")
    serializer_class = TankSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        station = self.request.query_params.get("station")
        if station:
            qs = qs.filter(station__id=station)
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdminOrOwner])
    def reconcile(self, request, pk=None):
        """
        This action simply enqueues a background reconciliation task. The heavy-lifting is done
        either by a Celery task (reconcile_tank_sales) or by the ReconcileStationAPIView below.
        """
        tank = self.get_object()
        reconcile_tank_sales.delay(str(tank.id))
        try:
            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="tank.reconcile.requested",
                target_type="Tank",
                target_id=str(tank.id),
                payload={"requested_by": request.user.username if request.user.is_authenticated else None},
            )
        except Exception:
            logger.exception("failed to create audit log for tank reconcile")
        return Response({"ok": True, "message": "reconcile scheduled"}, status=status.HTTP_202_ACCEPTED)


class TankReadingsList(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        tank = get_object_or_404(Tank, pk=pk)
        qs = TankReading.objects.filter(tank=tank).order_by("-measured_at")[:50]
        serializer = TankReadingSerializer(qs, many=True)
        return Response({"results": serializer.data})


# ---------------------------
# Station-level reconcile endpoint
# ---------------------------
class ReconcileStationAPIView(APIView):
    """
    POST /api/v1/reconcile/station/<station_id>/
    Body (json, optional): { "create_anomalies": true, "threshold_l": 50, "threshold_percent": 0.2 }
    Performs checks across tanks at the station using the two most recent tank readings
    and the transactions between them. Returns a summary and (optionally) creates anomalies.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, station_id):
        create_anomalies = bool(request.data.get("create_anomalies", True))
        try:
            threshold_l = Decimal(str(request.data.get("threshold_l", 50)))
        except Exception:
            threshold_l = Decimal("50")
        try:
            threshold_pct = Decimal(str(request.data.get("threshold_percent", "0.2")))
        except Exception:
            threshold_pct = Decimal("0.2")

        station = get_object_or_404(Station, pk=station_id)
        tanks = Tank.objects.filter(station=station)
        summary = {"station_id": str(station.id), "checked_tanks": 0, "anomalies_created": 0, "details": []}

        for tank in tanks:
            # get last two readings (t1 = newest, t0 = previous)
            readings = list(TankReading.objects.filter(tank=tank).order_by("-measured_at")[:2])
            if len(readings) < 2:
                # Not enough readings to reconcile this tank
                summary["details"].append({
                    "tank_id": str(tank.id),
                    "status": "skipped",
                    "reason": "need_at_least_two_readings"
                })
                continue

            t1 = readings[0]
            t0 = readings[1]
            # sum transactions for the station between t0 (exclusive) and t1 (inclusive)
            tx_qs = Transaction.objects.filter(
                station=station,
                timestamp__gt=t0.measured_at,
                timestamp__lte=t1.measured_at,
                status="completed"
            )

            agg = tx_qs.aggregate(total_dispensed=Sum("volume_l"))
            total_dispensed = agg.get("total_dispensed") or Decimal("0")
            try:
                total_dispensed = Decimal(total_dispensed)
            except Exception:
                total_dispensed = Decimal(str(total_dispensed or "0"))

            expected_level = (Decimal(t0.level_l) - total_dispensed).quantize(Decimal("0.001"))
            actual_level = Decimal(t1.level_l)
            delta_l = (expected_level - actual_level).quantize(Decimal("0.001"))
            capacity = tank.capacity_l if tank.capacity_l else Decimal("1.0")
            try:
                delta_percent = (abs(delta_l) / Decimal(capacity) * Decimal("100")).quantize(Decimal("0.0001"))
            except Exception:
                delta_percent = Decimal("0.0")

            flagged = (abs(delta_l) > threshold_l) or (delta_percent > threshold_pct)

            detail = {
                "tank_id": str(tank.id),
                "t0": {"reading_id": str(t0.id), "measured_at": t0.measured_at.isoformat(), "level": str(t0.level_l)},
                "t1": {"reading_id": str(t1.id), "measured_at": t1.measured_at.isoformat(), "level": str(t1.level_l)},
                "total_dispensed": str(total_dispensed),
                "expected_level": str(expected_level),
                "actual_level": str(actual_level),
                "delta_l": str(delta_l),
                "delta_percent": str(delta_percent),
                "flagged": bool(flagged),
            }

            summary["checked_tanks"] += 1
            summary["details"].append(detail)

            if flagged and create_anomalies:
                # create anomaly (attach pump if we can find matching pump(s))
                try:
                    # try to find pump(s) using tank->pump mapping in metadata if exists, else leave pump null
                    pump = None
                    # we prefer to attach the first pump in station with matching fuel_type (best-effort)
                    pumps_qs = Pump.objects.filter(station=station, fuel_type=tank.fuel_type)
                    pump = pumps_qs.first() if pumps_qs.exists() else None

                    an = Anomaly.objects.create(
                        station=station,
                        pump=pump,
                        rule="tank_mismatch",
                        name="Tank level mismatch",
                        severity="critical" if abs(delta_l) > Decimal("200") else "warning",
                        score=float(abs(delta_l)),
                        details=detail,
                    )
                    summary["anomalies_created"] += 1
                    detail["anomaly_id"] = str(an.id)
                except Exception:
                    logger.exception("Failed to create anomaly for tank %s", tank.id)

        # small audit log
        try:
            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="reconcile.station",
                target_type="Station",
                target_id=str(station.id),
                payload={"checked_tanks": summary["checked_tanks"], "anomalies_created": summary["anomalies_created"]}
            )
        except Exception:
            logger.exception("failed to write audit log for reconcile.station")

        return Response({"summary": {"checked_tanks": summary["checked_tanks"], "anomalies": summary["anomalies_created"]}, "details": summary["details"]}, status=status.HTTP_200_OK)


# ---------------------------
# Anomaly ViewSet with actions
# ---------------------------
class AnomalyViewSet(viewsets.ModelViewSet):
    queryset = Anomaly.objects.all().order_by("-created_at")
    serializer_class = AnomalySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        station = self.request.query_params.get("station")
        if station:
            qs = qs.filter(station__id=station)
        return qs

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAttendantOrOwner])
    def acknowledge(self, request, pk=None):
        an = self.get_object()
        if getattr(an, "acknowledged", False):
            return Response({"ok": True, "message": "already acknowledged"}, status=status.HTTP_200_OK)

        an.acknowledged = True
        an.acknowledged_at = timezone.now()
        an.acknowledged_by = request.user if request.user.is_authenticated else None
        an.save(update_fields=["acknowledged", "acknowledged_at", "acknowledged_by"])

        try:
            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="anomaly.acknowledged",
                target_type="Anomaly",
                target_id=str(an.id),
                payload={"by": request.user.username if request.user.is_authenticated else None},
            )
        except Exception:
            logger.exception("failed to create audit log for anomaly acknowledge")

        return Response(AnomalySerializer(an).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsAdminOrOwner])
    def resolve(self, request, pk=None):
        an = self.get_object()
        if getattr(an, "resolved", False):
            return Response({"ok": True, "message": "already resolved"}, status=status.HTTP_200_OK)

        an.resolved = True
        an.resolved_at = timezone.now()
        an.resolved_by = request.user if request.user.is_authenticated else None
        an.save(update_fields=["resolved", "resolved_at", "resolved_by"])

        try:
            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="anomaly.resolved",
                target_type="Anomaly",
                target_id=str(an.id),
                payload={"by": request.user.username if request.user.is_authenticated else None},
            )
        except Exception:
            logger.exception("failed to create audit log for anomaly resolve")

        return Response(AnomalySerializer(an).data, status=status.HTTP_200_OK)


# ---------------------------
# Simple helper endpoints
# ---------------------------
class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        profile_obj = getattr(user, "profile", None)
        profile = None
        if profile_obj:
            profile = {
                "role": profile_obj.role,
                "station": str(profile_obj.station.id) if getattr(profile_obj, "station", None) else None,
                "metadata": getattr(profile_obj, "metadata", {}) or {},
            }
        data = {"id": str(user.id), "username": user.username, "email": user.email, "profile": profile}
        return Response(data)


class LogoutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReceiptSendSMSAPIView(APIView):
    """
    POST /api/v1/receipts/send-sms/
    body: { "receipt_token": "...", "to": "+2637...", "message": "optional text" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        receipt_token = request.data.get("receipt_token")
        to_number = request.data.get("to")
        message = request.data.get("message", None)

        if not receipt_token or not to_number:
            return Response({"detail": "receipt_token and to are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            receipt = Receipt.objects.filter(receipt_token=receipt_token).first()
        except Exception:
            receipt = None

        try:
            send_receipt_sms.delay(receipt_token, to_number, message)
        except Exception:
            logger.exception("failed to enqueue send_receipt_sms task")
            return Response({"ok": False, "queued": False}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            AuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action="receipt.sms.requested",
                target_type="Receipt",
                target_id=str(receipt.id) if receipt else None,
                payload={"to": to_number, "by": request.user.username if request.user.is_authenticated else None},
            )
        except Exception:
            logger.exception("failed to write audit log for receipt.send-sms")

        return Response({"ok": True, "queued": True}, status=status.HTTP_202_ACCEPTED)


class StationViewSet(viewsets.ModelViewSet):
    queryset = Station.objects.all().order_by("-id")
    serializer_class = StationSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated])
    def pumps(self, request, pk=None):
        station = self.get_object()
        pumps_qs = Pump.objects.filter(station=station).order_by("pump_number")
        serializer = PumpSerializer(pumps_qs, many=True, context={"request": request})
        return Response(serializer.data)

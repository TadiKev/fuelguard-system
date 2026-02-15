# core/serializers.py
from django.conf import settings
from django.core import signing
from django.db import transaction as db_transaction
from rest_framework import serializers
import logging

logger = logging.getLogger(__name__)

# import models referenced by serializers
from .models import (
    Station,
    Pump,
    Transaction,
    Receipt,
    AuditLog,
    Rule,
    Anomaly,
    User,
    Tank,
    TankReading,
)

#
# Station
#
class StationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Station
        fields = "__all__"


#
# Pump
#
class PumpSerializer(serializers.ModelSerializer):
    # extra convenience fields for frontend
    is_online = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    pump_number = serializers.SerializerMethodField()

    class Meta:
        model = Pump
        # using "__all__" is fine; SerializerMethodField values will be included too
        fields = "__all__"

    def get_is_online(self, obj):
        try:
            return bool(getattr(obj, "is_online", False))
        except Exception:
            return False

    def get_status(self, obj):
        try:
            # prefer explicit status_label (combines last_heartbeat + maintenance)
            return getattr(obj, "status_label", None) or getattr(obj, "status", "unknown")
        except Exception:
            return "unknown"

    def get_pump_number(self, obj):
        # support older data shapes
        return getattr(obj, "pump_number", None) or getattr(obj, "number", None) or str(obj.id)


#
# Transaction create + serializer
#
class TransactionCreateSerializer(serializers.ModelSerializer):
    external_id = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "station",
            "pump",
            "attendant",
            "timestamp",
            "volume_l",
            "unit_price",
            "total_amount",
            "external_tx_ref",
            "raw_event",
            "status",
            "external_id",
        ]
        read_only_fields = ["id", "status"]

    def validate(self, data):
        pump = data.get("pump")
        station = data.get("station")
        if pump and station and getattr(pump, "station_id", None) != getattr(station, "id", None):
            raise serializers.ValidationError("Pump does not belong to station")
        # compute total if missing
        if data.get("total_amount") is None:
            data["total_amount"] = (data.get("volume_l") or 0) * (data.get("unit_price") or 0)
        return data

    def create(self, validated_data):
        """
        Create transaction + receipt synchronously then schedule background tasks after commit.
        """
        from .tasks import publish_transaction_event, evaluate_transaction_rules

        raw = validated_data.pop("raw_event", {}) or {}
        external = validated_data.pop("external_id", None)

        with db_transaction.atomic():
            tx = Transaction.objects.create(raw_event=raw, external_tx_ref=external, **validated_data)

            # audit log
            try:
                AuditLog.objects.create(
                    actor=tx.attendant if tx.attendant else None,
                    action="transaction.created",
                    target_type="Transaction",
                    target_id=str(tx.id),
                    payload={"transaction_id": str(tx.id), "station": str(tx.station_id)},
                )
            except Exception:
                logger.exception("failed to create audit log for tx %s", tx.id)

            # create receipt synchronously so UI gets token immediately
            token_payload = {"transaction_id": str(tx.id), "ts": str(tx.timestamp)}
            receipt_token = signing.dumps(token_payload, key=settings.SECRET_KEY)
            # create receipt with token (Receipt.save() will sign/generate token if needed)
            receipt = Receipt.objects.create(transaction=tx, receipt_token=receipt_token)

            # finalize tx
            tx.status = "completed"
            tx.save(update_fields=["status", "updated_at"])

            # build event for background workers
            event = {
                "event_type": "transaction.created",
                "transaction_id": str(tx.id),
                "station_id": str(tx.station_id),
                "pump_id": str(tx.pump_id) if tx.pump else None,
                "attendant_id": str(tx.attendant_id) if tx.attendant else None,
                "timestamp": tx.timestamp.isoformat(),
                "volume_l": float(tx.volume_l or 0),
                "unit_price": float(tx.unit_price or 0),
                "total_amount": float(tx.total_amount or 0),
                "raw_event": raw,
            }

            # enqueue after commit defensively
            def _enqueue_after_commit():
                try:
                    publish_transaction_event.apply_async((event,), ignore_result=True, retry=False)
                except Exception:
                    logger.exception("Failed to enqueue publish_transaction_event for tx %s", tx.id)
                try:
                    evaluate_transaction_rules.apply_async((str(tx.id),), ignore_result=True, retry=False)
                except Exception:
                    logger.exception("Failed to enqueue evaluate_transaction_rules for tx %s", tx.id)

            db_transaction.on_commit(_enqueue_after_commit)

        return tx


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = "__all__"


#
# Rule
#
class RuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rule
        fields = ["id", "name", "slug", "description", "rule_type", "config", "enabled", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


#
# Receipt
#
class ReceiptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = [
            "id",
            "transaction",
            "station",
            "amount",
            "issued_at",
            "signature",
            "receipt_token",
            "sent_to",
            "method",
            "sent_at",
        ]
        read_only_fields = ["id", "issued_at", "signature", "receipt_token"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        try:
            data["payload"] = instance.to_payload_dict()
        except Exception:
            data["payload"] = {}
        return data


class ReceiptCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = ["transaction", "method", "sent_to"]

    def validate(self, data):
        method = data.get("method")
        sent_to = data.get("sent_to")
        if method in ("sms", "email") and not sent_to:
            raise serializers.ValidationError({"sent_to": "required for chosen method"})
        return data

    def create(self, validated_data):
        receipt = Receipt(transaction=validated_data["transaction"], method=validated_data.get("method"), sent_to=validated_data.get("sent_to"))
        receipt.save()
        return receipt


class GenerateReceiptSerializer(serializers.Serializer):
    transaction_id = serializers.UUIDField()


# Serializer used by GET /receipts/<token>/verify/ (legacy)
class ReceiptVerifySerializer(serializers.Serializer):
    token = serializers.CharField()

    def validate(self, data):
        # keep same behavior as previous implementation (validate token format)
        token = data.get("token")
        try:
            payload = signing.loads(token, key=settings.SECRET_KEY)
            data["token"] = payload
            return data
        except Exception as e:
            raise serializers.ValidationError("Invalid token") from e


# Serializer used by POST /receipts/verify/ (body: { receipt_token })
class VerifyReceiptSerializer(serializers.Serializer):
    receipt_token = serializers.CharField()


#
# Anomaly
#
class AnomalySerializer(serializers.ModelSerializer):
    class Meta:
        model = Anomaly
        fields = [
            "id",
            "station",
            "pump",
            "transaction",
            "rule",
            "name",
            "severity",
            "score",
            "details",
            "acknowledged",
            "acknowledged_by",
            "acknowledged_at",
            "resolved",
            "resolved_by",
            "resolved_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "acknowledged_at", "resolved_at", "acknowledged_by", "resolved_by"]


#
# Tank & TankReading
#
class TankSerializer(serializers.ModelSerializer):
    """
    NOTE: Tank model does not have a `name` field in your schema.
    Use `fuel_type` and capacity/current level fields that exist.
    """
    class Meta:
        model = Tank
        fields = ["id", "station", "fuel_type", "capacity_l", "current_level_l", "last_read_at", "created_at"]
        read_only_fields = ["id", "last_read_at", "created_at"]


class TankReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankReading
        fields = ["id", "tank", "level_l", "measured_at", "source", "created_at"]
        read_only_fields = ["id", "measured_at", "created_at"]

# core/tasks.py
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta
from decimal import Decimal

import redis
import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone

logger = logging.getLogger(__name__)

from .models import (
    Transaction,
    Anomaly,
    Receipt,
    AuditLog,
    Rule as RuleModel,
    Tank,
    TankReading,
)

# Optional rule registry/sms module — keep optional imports safe
try:
    from .rules.registry import get_rule_registry, RULE_REGISTRY  # if present
except Exception:
    get_rule_registry = None
    RULE_REGISTRY = {}

try:
    from . import sms as sms_module
except Exception:
    sms_module = None


# ---------- helpers ----------
def _get_redis():
    url = getattr(settings, "REDIS_URL", "redis://redis:6379/0")
    return redis.from_url(url)


def _broadcast_to_channels(group_name: str, event_type: str, payload: dict):
    """
    Helper to send a channels group message synchronously from Celery.
    """
    try:
        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.debug("No channel_layer available; skipping channels broadcast.")
            return
        message = {"type": event_type.replace(".", "_"), "payload": payload}
        async_to_sync(channel_layer.group_send)(group_name, message)
    except Exception as exc:
        logger.exception("Failed to broadcast to channels group=%s: %s", group_name, exc)


# ---------- publish event ----------
@shared_task(ignore_result=True)
def publish_transaction_event(event: dict):
    """
    Publish generic event to Redis pubsub ('fuelguard:events').
    """
    try:
        r = _get_redis()
        r.publish("fuelguard:events", json.dumps(event))
    except Exception:
        logger.exception("Failed to publish transaction event to Redis")


# ---------- evaluate rules ----------
@shared_task(ignore_result=True, bind=True)
def evaluate_transaction_rules(self, transaction_id: str):
    """
    Evaluate rules for a transaction. Creates Anomaly rows when rules fire,
    publishes to Redis AND to Channels (websocket groups).
    """
    try:
        tx = Transaction.objects.select_related("pump", "station").get(id=transaction_id)
    except Transaction.DoesNotExist:
        logger.warning("Transaction not found: %s", transaction_id)
        return

    created_anomalies = []

    # Try DB rules first
    db_rules = RuleModel.objects.filter(enabled=True) if RuleModel.objects.exists() else []

    # Attempt to use registry-based rule engines if available
    registry = None
    if get_rule_registry:
        try:
            registry = get_rule_registry()
        except Exception:
            registry = None

    if not db_rules:
        # fallback simple example rule
        try:
            vol = float(tx.volume_l)
        except Exception:
            vol = None

        if vol is not None and vol < 0.1:
            anomaly = Anomaly.objects.create(
                station=tx.station,
                transaction=tx,
                pump=tx.pump,
                rule=None,
                severity="warning",
                details={"reason": "volume_too_small", "volume_l": vol},
            )
            created_anomalies.append(anomaly)

            AuditLog.objects.create(
                actor=None,
                action="anomaly.created",
                target_type="Anomaly",
                target_id=str(anomaly.id),
                payload={"reason": "built_in_under_litre", "transaction": str(tx.id)},
            )

            payload = {
                "event_type": "anomaly.detected",
                "anomaly_id": str(anomaly.id),
                "rule_id": "under_litre",
                "station_id": str(tx.station.id),
                "transaction_id": str(tx.id),
                "timestamp": anomaly.created_at.isoformat(),
                "severity": anomaly.severity,
                "details": anomaly.details,
            }

            try:
                _get_redis().publish("fuelguard:events", json.dumps(payload))
            except Exception:
                logger.exception("Failed to publish anomaly to Redis")

            _broadcast_to_channels(f"station_{tx.station.id}", "station_event", payload)
            _broadcast_to_channels("stations", "station_event", payload)
    else:
        # Evaluate DB-backed rules (using registry classes if available)
        for rule_row in db_rules:
            rule_cls = None
            try:
                rule_cls = registry.get(rule_row.slug) if registry else None
            except Exception:
                rule_cls = None

            if not rule_cls and RULE_REGISTRY:
                rule_cls = RULE_REGISTRY.get(rule_row.rule_type)

            if not rule_cls:
                logger.debug("No rule class for %s; skipping", rule_row.slug)
                continue

            try:
                engine = rule_cls(rule_row)
                anomalies_out = engine.evaluate(tx) or []
            except Exception:
                logger.exception("Rule engine crashed for %s on tx %s", rule_row.slug, tx.id)
                continue

            for out in (anomalies_out if isinstance(anomalies_out, (list, tuple)) else [anomalies_out]):
                try:
                    anomaly = Anomaly.objects.create(
                        station=tx.station,
                        transaction=tx,
                        pump=tx.pump,
                        rule=rule_row,
                        severity=out.get("severity", "warning"),
                        score=out.get("score"),
                        details=out.get("details", {}),
                        name=out.get("name") or rule_row.name or rule_row.slug,
                    )
                except Exception:
                    logger.exception("Failed to create Anomaly DB row")
                    continue

                created_anomalies.append(anomaly)

                try:
                    AuditLog.objects.create(
                        actor=None,
                        action="anomaly.created",
                        target_type="Anomaly",
                        target_id=str(anomaly.id),
                        payload={"anomaly": anomaly.details, "transaction": str(tx.id)},
                    )
                except Exception:
                    logger.exception("Failed to write AuditLog for anomaly %s", anomaly.id)

                payload = {
                    "event_type": "anomaly.detected",
                    "anomaly_id": str(anomaly.id),
                    "rule_id": rule_row.slug or rule_row.rule_type,
                    "station_id": str(tx.station.id),
                    "transaction_id": str(tx.id),
                    "timestamp": anomaly.created_at.isoformat(),
                    "severity": anomaly.severity,
                    "details": anomaly.details,
                }

                try:
                    _get_redis().publish("fuelguard:events", json.dumps(payload))
                except Exception:
                    logger.exception("Failed to publish anomaly to Redis")

                _broadcast_to_channels(f"station_{tx.station.id}", "station_event", payload)
                _broadcast_to_channels("stations", "station_event", payload)

    # schedule sending receipt (best-effort)
    try:
        send_receipt_for_transaction.delay(str(tx.id))
    except Exception:
        logger.exception("Failed to schedule send_receipt_for_transaction for %s", tx.id)


# ---------- send receipt ----------
@shared_task(ignore_result=True)
def send_receipt_for_transaction(transaction_id: str):
    """
    Send (or mock-send) a receipt for a transaction; update Receipt.sent_at
    and notify via Channels that a receipt was sent.
    """
    try:
        tx = Transaction.objects.select_related("receipt", "station").get(id=transaction_id)
    except Transaction.DoesNotExist:
        logger.warning("Transaction not found for receipt send: %s", transaction_id)
        return

    receipt = getattr(tx, "receipt", None)
    if not receipt:
        logger.debug("No receipt attached to transaction %s", tx.id)
        return

    message = f"Receipt {receipt.receipt_token}\nStation: {getattr(tx.station, 'name', '')}\nAmount: {tx.total_amount}\nVolume: {tx.volume_l}"

    try:
        if receipt.method == "sms":
            # prefer our sms module or Celery task
            if sms_module and hasattr(sms_module, "send_sms"):
                try:
                    sms_module.send_sms(getattr(settings, "SMS_PROVIDER", "mock"), receipt.sent_to or "", message)
                except Exception:
                    logger.exception("sms_module.send_sms failed for receipt %s", receipt.id)
            else:
                # fallback to Celery task below
                try:
                    send_receipt_sms.delay(receipt.receipt_token, receipt.sent_to or "", message)
                except Exception:
                    logger.exception("Failed to schedule send_receipt_sms for %s", receipt.id)
        else:
            # fallback to email
            try:
                send_mail(
                    f"FuelGuard Receipt {tx.id}",
                    message,
                    getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@fuelguard.local"),
                    [receipt.sent_to or "demo@example.com"],
                )
            except Exception:
                logger.exception("Email send failed for receipt %s", receipt.id)
    except Exception:
        logger.exception("Failed to send receipt for transaction %s", tx.id)

    # mark receipt as sent
    try:
        receipt.sent_at = timezone.now()
        receipt.save(update_fields=["sent_at"])
    except Exception:
        logger.exception("Failed to update receipt.sent_at for %s", receipt.id)

    payload = {
        "event_type": "receipt.sent",
        "transaction_id": str(tx.id),
        "receipt_token": receipt.receipt_token,
        "sent_at": (receipt.sent_at.isoformat() if receipt.sent_at else datetime.utcnow().isoformat()),
    }

    try:
        _get_redis().publish("fuelguard:events", json.dumps(payload))
    except Exception:
        logger.exception("Failed to publish receipt event to Redis")

    _broadcast_to_channels(f"station_{tx.station.id}", "station_event", payload)
    _broadcast_to_channels("stations", "station_event", payload)


# ---------- send SMS (Celery) ----------
@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_receipt_sms(self, receipt_token: str, to_number: str, text_template: str = None):
    """
    Send SMS with receipt_token to `to_number`.
    Uses Twilio config if present; otherwise logs (dev fallback).
    """
    try:
        if not to_number:
            raise ValueError("No destination number provided")

        body = text_template or f"Your FuelGuard receipt: {receipt_token}"

        sid = getattr(settings, "TWILIO_ACCOUNT_SID", os.getenv("TWILIO_ACCOUNT_SID"))
        auth = getattr(settings, "TWILIO_AUTH_TOKEN", os.getenv("TWILIO_AUTH_TOKEN"))
        from_num = getattr(settings, "TWILIO_FROM_NUMBER", os.getenv("TWILIO_FROM_NUMBER"))

        if sid and auth and from_num:
            resp = requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                data={"From": from_num, "To": to_number, "Body": body},
                auth=(sid, auth),
                timeout=15,
            )
            if resp.status_code >= 400:
                logger.error("Twilio send failed: %s %s", resp.status_code, resp.text)
                resp.raise_for_status()
            logger.info("SMS sent via Twilio to %s", to_number)
            return {"ok": True, "provider": "twilio", "code": resp.status_code}
        else:
            # fallback: log to server (dev)
            logger.info("SMS (dev-fallback) to %s: %s", to_number, body)
            return {"ok": True, "provider": "log"}
    except Exception as exc:
        logger.exception("send_receipt_sms failed")
        try:
            self.retry(exc=exc)
        except Exception:
            raise




# ---------- core reconcile implementation ----------
def _reconcile_tank_sales_logic(tank_id, tolerance_l=5.0, lookback_hours=24):
    """
    Synchronous reconciliation logic — returns a dict result.
    - Requires two recent TankReading rows (previous, current).
    - Compares actual_drop = previous.level - current.level vs summed tx volume
      between previous.measured_at and current.measured_at.
    - Creates Anomaly + AuditLog when absolute diff > tolerance_l.
    """
    try:
        tank = Tank.objects.select_related("station").get(id=tank_id)
    except Tank.DoesNotExist:
        return {"ok": False, "error": "tank_not_found"}

    readings = list(
        TankReading.objects.filter(tank=tank).order_by("-measured_at")[:2]
    )

    if len(readings) < 2:
        return {"ok": False, "error": "need_two_readings"}

    current, previous = readings[0], readings[1]

    delta_seconds = (current.measured_at - previous.measured_at).total_seconds()
    if delta_seconds > lookback_hours * 3600:
        logger.warning("Large reconcile window for tank %s: %.2f hours", tank.id, delta_seconds / 3600)

    try:
        actual_drop = Decimal(previous.level_l) - Decimal(current.level_l)
    except Exception:
        actual_drop = Decimal("0")

    if actual_drop < 0:
        # tank level increased (refill) — not an error for mismatch
        return {
            "ok": True,
            "note": "tank_level_increase_or_refill",
            "actual_drop_l": float(actual_drop),
        }

    tx_agg = Transaction.objects.filter(
        station=tank.station,
        timestamp__gte=previous.measured_at,
        timestamp__lte=current.measured_at,
        status="completed",
    ).aggregate(total=Sum("volume_l"))

    expected_sales = Decimal(tx_agg["total"] or 0)
    diff = abs(expected_sales - actual_drop)
    tolerance = Decimal(str(tolerance_l))
    mismatch = diff > tolerance

    details = {
        "tank_id": str(tank.id),
        "station_id": str(tank.station.id),
        "previous_level_l": float(previous.level_l),
        "current_level_l": float(current.level_l),
        "actual_drop_l": float(actual_drop),
        "expected_sales_l": float(expected_sales),
        "diff_l": float(diff),
        "tolerance_l": float(tolerance),
        "window_start": previous.measured_at.isoformat(),
        "window_end": current.measured_at.isoformat(),
    }

    anomaly_id = None
    if mismatch:
        anomaly = Anomaly.objects.create(
            station=tank.station,
            pump=None,
            transaction=None,
            rule="tank_mismatch",
            name="Tank vs Sales Mismatch",
            severity="critical",
            score=float(min(1.0, diff / (tolerance or Decimal("1")))),
            details=details,
        )
        anomaly_id = str(anomaly.id)

        try:
            AuditLog.objects.create(
                actor=None,
                action="tank.reconcile.mismatch",
                target_type="Tank",
                target_id=str(tank.id),
                payload=details,
            )
        except Exception:
            logger.exception("Failed to write audit log")

        # optionally publish anomaly event to channels (best-effort)
        try:
            payload = {
                "event_type": "anomaly.created",
                "anomaly_id": anomaly_id,
                "station_id": str(tank.station.id),
                "details": details,
            }
            async_to_sync(get_channel_layer().group_send)(
                f"stations_{tank.station.id}",
                {"type": "broadcast.message", "text": payload},
            )
        except Exception:
            # don't fail the reconcile if channels publish breaks
            logger.debug("channels publish failed (non-fatal)")

    return {
        "ok": True,
        "tank_id": str(tank.id),
        "mismatch": bool(mismatch),
        "diff_l": float(diff),
        "anomaly_id": anomaly_id,
        "details": details,
    }


# ---------- celery wrapper (async) ----------
@shared_task(bind=True, name="core.tasks.reconcile_tank_sales")
def reconcile_tank_sales(self, tank_id, tolerance_l=5.0, lookback_hours=24, window_hours=None):
    """
    Celery task wrapper for reconcile logic.
    Accepts either lookback_hours or window_hours (CLI-friendly name).
    """
    try:
        if window_hours is not None:
            lookback_hours = int(window_hours)
        return _reconcile_tank_sales_logic(tank_id, tolerance_l=tolerance_l, lookback_hours=lookback_hours)
    except Exception as exc:
        logger.exception("reconcile_tank_sales failed for tank %s: %s", tank_id, exc)
        raise


# ---------- sync helper for management command or direct call ----------
def reconcile_tank_sales_sync(tank_id, tolerance_l=5.0, lookback_hours=24, window_hours=None):
    """
    Synchronous function for management commands or direct imports.
    Accepts window_hours (CLI name) and lookback_hours (internal) for compatibility.
    """
    if window_hours is not None:
        lookback_hours = int(window_hours)
    return _reconcile_tank_sales_logic(tank_id, tolerance_l=tolerance_l, lookback_hours=lookback_hours)


# ---------- convenience utility: publish anomaly events (optional) ----------
@shared_task(ignore_result=True)
def publish_anomaly_event(payload: dict):
    """
    Try to broadcast anomaly event on channels group: stations_<station_id>
    """
    station_id = payload.get("station_id")
    if not station_id:
        logger.debug("publish_anomaly_event: missing station_id")
        return
    try:
        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.debug("publish_anomaly_event: no channel_layer")
            return
        group = f"stations_{station_id}"
        async_to_sync(channel_layer.group_send)(group, {"type": "broadcast.message", "text": payload})
    except Exception as e:
        logger.exception("publish_anomaly_event failed: %s", e)

# core/tasks.py
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

# Try to import Celery if available; otherwise provide a simple fallback.
try:
    from celery import shared_task

    @shared_task(ignore_result=True)
    def reconcile_tank_sales(tank_id):
        # import locally to avoid circular import
        from .services import run_tank_mismatch_detector
        try:
            return run_tank_mismatch_detector(tank_id)
        except Exception:
            logger.exception("reconcile_tank_sales task failed for tank %s", tank_id)
            return None

except Exception:
    # Fallback (no celery) — run synchronously. Good for local/dev.
    def reconcile_tank_sales(tank_id):
        from .services import run_tank_mismatch_detector
        try:
            return run_tank_mismatch_detector(tank_id)
        except Exception:
            logger.exception("reconcile_tank_sales fallback failed for tank %s", tank_id)
            return None

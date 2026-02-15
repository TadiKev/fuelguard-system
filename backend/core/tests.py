import json
import redis
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.mail import send_mail
from .models import Transaction, Anomaly, Receipt, AuditLog

@shared_task
def publish_transaction_event(event):
    """Publish raw event to Redis pubsub channel (for logs/observers)"""
    r = redis.from_url(settings.REDIS_URL)
    r.publish('fuelguard:events', json.dumps(event))

@shared_task
def evaluate_transaction_rules(transaction_id):
    """
    Example rule evaluation flow:
    - load transaction
    - run some simple rules
    - create Anomaly if needed
    - publish anomaly event to channel layer (station group)
    - send receipt (enqueue)
    """
    try:
        tx = Transaction.objects.get(id=transaction_id)
    except Transaction.DoesNotExist:
        return

    created_anomalies = []
    # Example rule 1: under_dispense if volume < 0.1 L
    try:
        volume = float(tx.volume_l)
    except Exception:
        volume = 0.0

    if volume < 0.1:
        anomaly = Anomaly.objects.create(
            station=tx.station,
            transaction=tx,
            severity='warning',
            details={'reason': 'volume_too_small', 'volume_l': volume},
        )
        created_anomalies.append(anomaly)

    # Build event payloads for each anomaly
    channel_layer = get_channel_layer()
    for anomaly in created_anomalies:
        payload = {
            "event_type": "anomaly.detected",
            "anomaly_id": str(anomaly.id),
            "rule": "under_dispense",
            "station_id": str(anomaly.station.id),
            "transaction_id": str(tx.id),
            "timestamp": anomaly.created_at.isoformat(),
            "severity": anomaly.severity,
            "details": anomaly.details,
        }
        # Publish to Redis pubsub for observers too
        try:
            r = redis.from_url(settings.REDIS_URL)
            r.publish('fuelguard:events', json.dumps(payload))
        except Exception:
            pass

        # Send to channels group for station
        group_name = f"station_{anomaly.station.id}"
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "station_event",
                "payload": payload,
            },
        )

    # After rules, enqueue receipt sending
    send_receipt_for_transaction.delay(str(tx.id))

@shared_task
def send_receipt_for_transaction(transaction_id):
    try:
        tx = Transaction.objects.get(id=transaction_id)
    except Transaction.DoesNotExist:
        return
    receipt = getattr(tx, 'receipt', None)
    if not receipt:
        return

    # Example: send via email (MailHog in dev)
    subject = f"FuelGuard Receipt: {tx.id}"
    message = f"Receipt token: {receipt.receipt_token}\nTransaction: {tx.id}\nAmount: {tx.total_amount}"
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL or 'noreply@fuelguard.local', [receipt.sent_to or 'demo@example.com'])
    except Exception:
        # ignore email send errors in dev
        pass

    receipt.sent_at = timezone.now()
    receipt.save(update_fields=['sent_at'])

    # Notify via channel layer that receipt sent
    channel_layer = get_channel_layer()
    payload = {
        "event_type": "receipt.sent",
        "transaction_id": str(tx.id),
        "receipt_token": receipt.receipt_token,
        "sent_at": receipt.sent_at.isoformat(),
    }
    try:
        async_to_sync(channel_layer.group_send)(
            f"station_{tx.station.id}",
            {"type": "station_event", "payload": payload},
        )
    except Exception:
        pass

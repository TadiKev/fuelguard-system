import json
from celery import shared_task
from django.conf import settings
import redis
from .models import Transaction, Anomaly, Rule, Receipt
from django.core.mail import send_mail
from django.utils import timezone

@shared_task
def publish_transaction_event(event):
    # push to Redis pubsub channel 'events' for other subscribers
    r = redis.from_url(settings.REDIS_URL)
    r.publish('fuelguard:events', json.dumps(event))

@shared_task
def evaluate_transaction_rules(transaction_id):
    # simple stubbed rule engine; in real life, load active rules and evaluate
    try:
        tx = Transaction.objects.get(id=transaction_id)
    except Transaction.DoesNotExist:
        return
    # Example simple rule: under_dispense if volume < 0.1 L
    if float(tx.volume_l) < 0.1:
        rule = {'slug':'under_litre','description':'very small dispense'}
        anomaly = Anomaly.objects.create(
            station=tx.station,
            transaction=tx,
            severity='warning',
            details={'reason':'volume_too_small','volume_l': float(tx.volume_l)},
        )
        # push anomaly event to redis
        event = {
            "event_type":"anomaly.detected",
            "anomaly_id": str(anomaly.id),
            "rule_id": rule.get('slug'),
            "station_id": str(tx.station.id),
            "transaction_id": str(tx.id),
            "timestamp": timezone.now().isoformat(),
            "severity": anomaly.severity,
            "details": anomaly.details
        }
        redis.from_url(settings.REDIS_URL).publish('fuelguard:events', json.dumps(event))
    # send receipt (simulate)
    send_receipt_for_transaction.delay(str(tx.id))

@shared_task
def send_receipt_for_transaction(transaction_id):
    try:
        tx = Transaction.objects.get(id=transaction_id)
    except Transaction.DoesNotExist:
        return
    receipt = tx.receipt
    if not receipt:
        return
    # For demo: write to AuditLog and optionally send via mailhog/mocked SMS
    # Example email using Django send_mail (MailHog will show it in dev)
    subject = f"FuelGuard Receipt: {tx.id}"
    message = f"Receipt token: {receipt.receipt_token}\nTransaction: {tx.id}\nAmount: {tx.total_amount}"
    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL or 'noreply@fuelguard.local', [receipt.sent_to or 'demo@example.com'])
    receipt.sent_at = timezone.now()
    receipt.save(update_fields=['sent_at'])

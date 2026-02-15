# backend/core/sms/drivers/mock.py
from django.utils import timezone
from core.models import AuditLog

def send_sms(to, message):
    # Record a dev-friendly audit log and print
    payload = {"to": to, "message": message, "provider": "mock", "ts": str(timezone.now())}
    try:
        AuditLog.objects.create(actor=None, action='sms.mock.send', payload=payload)
    except Exception:
        # If DB not available (very early), ignore
        pass
    print(f"[MOCK SMS] to={to} message={message}")
    return True

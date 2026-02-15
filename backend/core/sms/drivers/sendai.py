# backend/core/sms/drivers/sendai.py
import os
from django.conf import settings
from django.utils import timezone
from core.models import AuditLog

API_URL = "https://api.sendai.io/v1/messages"  # example placeholder

def send_sms(to, message):
    """
    Lazy-import requests so module import doesn't fail at worker startup if requests is not installed.
    This function raises a RuntimeError if SENDAI_API_KEY isn't configured or requests is missing.
    """
    api_key = getattr(settings, 'SENDAI_API_KEY', None) or os.getenv('SENDAI_API_KEY')
    if not api_key:
        raise RuntimeError("SENDAI_API_KEY not configured")

    try:
        import requests
    except Exception as e:
        # record to AuditLog for diagnostics, then raise
        try:
            AuditLog.objects.create(actor=None, action='sms.sendai.import_error', payload={"error": str(e), "to": to})
        except Exception:
            pass
        raise RuntimeError("requests library not installed in environment; install 'requests' to use Sendai driver") from e

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"to": to, "message": message}
    try:
        r = requests.post(API_URL, json=payload, headers=headers, timeout=10)
        r.raise_for_status()
        # log the provider response
        try:
            AuditLog.objects.create(actor=None, action='sms.sendai.sent', payload={"to": to, "response": r.json()})
        except Exception:
            pass
        return True
    except Exception as e:
        try:
            AuditLog.objects.create(actor=None, action='sms.sendai.error', payload={"to": to, "error": str(e)})
        except Exception:
            pass
        raise

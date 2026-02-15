# core/sms/__init__.py
from django.conf import settings
import importlib

PROVIDER = getattr(settings, "SMS_PROVIDER", "mock")

_DRIVER_MAP = {
    "mock": "core.sms.drivers.mock",
    "sendai": "core.sms.drivers.sendai",
}

def _load_driver():
    modpath = _DRIVER_MAP.get(PROVIDER)
    if not modpath:
        raise RuntimeError(f"Unknown SMS_PROVIDER={PROVIDER}")
    mod = importlib.import_module(modpath)
    return mod

_driver = _load_driver()

def send_sms(to, message, provider_meta=None):
    return _driver.send(to=to, message=message, provider_meta=provider_meta)

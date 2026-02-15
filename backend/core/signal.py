# core/signals.py
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from threading import Thread

from .models import TankReading
from .tasks import reconcile_tank_sales

logger = logging.getLogger(__name__)


def _spawn_reconcile(tank_id):
    """
    Try to enqueue a background reconcile. If reconcile_tank_sales has .delay (celery),
    call .delay, otherwise call it in a thread to avoid blocking the save.
    """
    try:
        if hasattr(reconcile_tank_sales, "delay"):
            reconcile_tank_sales.delay(tank_id)
            return
    except Exception:
        logger.debug("reconcile_tank_sales.delay not available")

    # fallback: run in a thread (non-blocking)
    try:
        t = Thread(target=reconcile_tank_sales, args=(tank_id,), daemon=True)
        t.start()
    except Exception:
        logger.exception("Failed to start thread to run reconcile_tank_sales for tank %s", tank_id)


@receiver(post_save, sender=TankReading)
def on_tank_reading_saved(sender, instance, created, **kwargs):
    # only run when a new reading is created (not on update)
    if not created:
        return
    tank_id = getattr(instance, "tank_id", None)
    if not tank_id:
        return
    # spawn background reconcile
    _spawn_reconcile(tank_id)

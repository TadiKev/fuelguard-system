# core/services.py
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone
from django.conf import settings
from django.db import transaction as db_transaction
from .models import Tank, TankReading, Transaction, Rule, Anomaly, AuditLog
import logging

logger = logging.getLogger(__name__)


def _decimal(v):
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def run_tank_mismatch_detector(tank_id):
    """
    Run a simple tank mismatch detector for the given tank.
    Returns: dict with detection result { 'flagged': bool, 'anomaly_id': str|None, 'details': {...} }
    """
    try:
        tank = Tank.objects.select_related("station").get(pk=tank_id)
    except Tank.DoesNotExist:
        return {"flagged": False, "reason": "no_tank"}

    # retrieve the latest two readings (t1 = newest, t0 = prior)
    readings = list(TankReading.objects.filter(tank=tank).order_by("-measured_at")[:2])
    if len(readings) < 2:
        return {"flagged": False, "reason": "not_enough_readings"}

    t1 = readings[0]
    t0 = readings[1]

    # sum completed transactions at the station between t0 and t1
    tx_qs = Transaction.objects.filter(
        station=tank.station,
        timestamp__gt=t0.measured_at,
        timestamp__lte=t1.measured_at,
        status="completed",
    )

    total_dispensed = sum((_decimal(tx.volume_l) for tx in tx_qs), Decimal("0.000"))

    expected_level = (_decimal(t0.level_l) - total_dispensed).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    actual_level = _decimal(t1.level_l)
    delta_l = (expected_level - actual_level).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

    capacity = _decimal(tank.capacity_l) or Decimal("1.0")
    delta_percent = (abs(delta_l) / capacity * Decimal("100")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    # thresholds (configurable via settings)
    L_THRESHOLD = _decimal(getattr(settings, "TANK_MISMATCH_L_THRESHOLD", 50))  # liters
    PERCENT_THRESHOLD = _decimal(getattr(settings, "TANK_MISMATCH_PERCENT_THRESHOLD", Decimal("0.2")))  # %

    flagged = (abs(delta_l) > L_THRESHOLD) or (delta_percent > PERCENT_THRESHOLD)

    details = {
        "t0": {"reading_id": str(t0.id), "measured_at": t0.measured_at.isoformat(), "level": str(t0.level_l)},
        "t1": {"reading_id": str(t1.id), "measured_at": t1.measured_at.isoformat(), "level": str(t1.level_l)},
        "total_dispensed_l": str(total_dispensed),
        "expected_level": str(expected_level),
        "actual_level": str(actual_level),
        "delta_l": str(delta_l),
        "delta_percent": str(delta_percent),
        "transactions_considered": [str(tx.id) for tx in tx_qs],
    }

    if flagged:
        # create or update a Rule object for 'tank_mismatch' (safe to call repeatedly)
        rule, _ = Rule.objects.get_or_create(
            slug="tank_mismatch",
            defaults={"name": "Tank mismatch", "rule_type": "tank_mismatch", "description": "Auto-created rule"}
        )

        severity = "critical" if abs(delta_l) > (L_THRESHOLD * Decimal("4")) else "warning"
        score = float(abs(delta_l))

        # create anomaly inside a transaction
        with db_transaction.atomic():
            an = Anomaly.objects.create(
                station=tank.station,
                pump=None,  # optional: you could try to infer pump from transactions if needed
                rule=rule.slug,
                name="Tank level mismatch",
                severity=severity,
                score=score,
                details=details
            )

            # audit log for operator traceability
            try:
                AuditLog.objects.create(
                    actor=None,
                    action="tank.reconcile.autodetect",
                    target_type="Tank",
                    target_id=str(tank.id),
                    payload={"anomaly_id": str(an.id), "summary": f"delta_l={delta_l}"},
                )
            except Exception:
                logger.exception("Failed to write audit log for tank_mismatch")

        return {"flagged": True, "anomaly_id": str(an.id), "details": details}

    return {"flagged": False, "details": details}

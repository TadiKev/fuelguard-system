# core/reconciliation.py
import logging
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone
from django.db import transaction as db_transaction

logger = logging.getLogger(__name__)

# Avoid circular imports at module import time:
def run_reconciliation_for_station(station, *, threshold_l=Decimal("50"), threshold_percent=Decimal("0.2"), create_anomalies=True):
    """
    Run a reconciliation pass for a given Station instance.

    Returns a dict summary:
    {
      "station_id": "<uuid>",
      "checked_tanks": [
         {
           "tank_id": "<uuid>",
           "t0": {"reading_id": "<uuid>", "level": "8000.000", "measured_at": "iso"},
           "t1": {...},
           "sum_transactions_l": "600.000",
           "expected_level": "7400.000",
           "actual_level": "7500.000",
           "delta_l": "-100.000",
           "delta_percent": "1.0000",
           "anomaly_created": True/False,
           "anomaly_id": "<uuid>" or None
         }, ...
      ],
      "summary": {"total_checked": N, "anomalies": M}
    }
    """
    from .models import Tank, TankReading, Transaction, Rule, Anomaly  # local import
    results = {"station_id": str(station.id), "checked_tanks": [], "summary": {"total_checked": 0, "anomalies": 0}}
    now = timezone.now()

    tanks = Tank.objects.filter(station=station).all()
    for tank in tanks:
        # find T1 = latest reading
        t1 = TankReading.objects.filter(tank=tank).order_by("-measured_at").first()
        # find T0 = previous reading before T1
        if not t1:
            logger.info("reconciliation: no T1 for tank %s", tank.id)
            continue
        t0 = TankReading.objects.filter(tank=tank, measured_at__lt=t1.measured_at).order_by("-measured_at").first()
        if not t0:
            # nothing to compare (no earlier reading)
            logger.info("reconciliation: no T0 (previous) for tank %s", tank.id)
            continue

        # sum transactions for station in the interval (t0.measured_at, t1.measured_at]
        tx_qs = Transaction.objects.filter(station=station, timestamp__gt=t0.measured_at, timestamp__lte=t1.measured_at, status="completed")
        S = tx_qs.aggregate(total_l=models.Sum("volume_l"))["total_l"] or Decimal("0.000")

        # expected level = t0.level - S
        expected_level = (Decimal(t0.level_l) - Decimal(S)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        actual_level = Decimal(t1.level_l).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        delta_l = (expected_level - actual_level).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        capacity = Decimal(tank.capacity_l or 1)
        # delta percent absolute relative to capacity
        try:
            delta_percent = (abs(delta_l) / capacity * Decimal("100")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        except Exception:
            delta_percent = Decimal("0.0000")

        flag = (abs(delta_l) > Decimal(threshold_l)) or (delta_percent > Decimal(threshold_percent))

        entry = {
            "tank_id": str(tank.id),
            "t0": {"reading_id": str(t0.id), "measured_at": t0.measured_at.isoformat(), "level": f"{Decimal(t0.level_l):.3f}"},
            "t1": {"reading_id": str(t1.id), "measured_at": t1.measured_at.isoformat(), "level": f"{Decimal(t1.level_l):.3f}"},
            "sum_transactions_l": f"{Decimal(S):.3f}",
            "expected_level": f"{expected_level:.3f}",
            "actual_level": f"{actual_level:.3f}",
            "delta_l": f"{delta_l:.3f}",
            "delta_percent": f"{delta_percent:.4f}",
            "anomaly_created": False,
            "anomaly_id": None,
        }

        if flag and create_anomalies:
            # create or fetch existing rule
            rule, _ = Rule.objects.get_or_create(slug="tank_mismatch", defaults={"name": "Tank mismatch", "rule_type": "tank_mismatch", "description": "Auto-created rule by reconciliation"})
            details = {
                "expected_level": str(entry["expected_level"]),
                "actual_level": str(entry["actual_level"]),
                "delta_l": str(entry["delta_l"]),
                "delta_percent": str(entry["delta_percent"]),
                "transactions_considered": [str(x.id) for x in tx_qs],
                "t0": entry["t0"],
                "t1": entry["t1"],
            }
            with db_transaction.atomic():
                an = Anomaly.objects.create(
                    station=station,
                    pump=None,  # ambiguous: pump not strictly tied to tank, leave None or choose best mapping
                    rule="tank_mismatch",
                    name="Tank level mismatch (reconciliation)",
                    severity="critical" if abs(Decimal(entry["delta_l"])) > Decimal("200") else "warning",
                    score=float(abs(Decimal(entry["delta_l"]))),
                    details=details,
                )
            entry["anomaly_created"] = True
            entry["anomaly_id"] = str(an.id)

        results["checked_tanks"].append(entry)

    results["summary"]["total_checked"] = len(results["checked_tanks"])
    results["summary"]["anomalies"] = sum(1 for e in results["checked_tanks"] if e["anomaly_created"])
    results["ran_at"] = now.isoformat()
    return results

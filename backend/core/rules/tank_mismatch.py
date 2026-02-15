# core/rules/tank_mismatch.py
from .base import BaseRule
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta
from core.models import Tank, TankReading, Transaction

class TankMismatchRule(BaseRule):
    slug = "tank_mismatch"
    name = "Tank mismatch"
    default_config = {"tolerance_l": 5.0, "lookback_minutes": 120}

    def evaluate(self, transaction, ctx):
        # ctx expected to contain 'tank' OR we'll try to find a tank for the station
        tank = ctx.get("tank")
        if not tank:
            # optionally find any tank for station:
            try:
                tank = Tank.objects.filter(station=transaction.station).first()
            except Exception:
                return None

        # get latest two readings
        readings = list(tank.readings.order_by('-measured_at')[:2])
        if len(readings) < 2:
            return None

        current, previous = readings[0], readings[1]
        actual_drop = Decimal(previous.level_l) - Decimal(current.level_l)
        if actual_drop <= 0:
            return None

        # expected sales between previous and current
        txs = Transaction.objects.filter(
            station=transaction.station,
            timestamp__gte=previous.measured_at,
            timestamp__lte=current.measured_at,
            status='completed'
        )
        expected = Decimal(txs.aggregate(total=Sum('volume_l'))['total'] or 0)
        diff = abs(expected - actual_drop)
        tol = Decimal(self.config.get("tolerance_l", 5.0))
        if diff > tol:
            return {
                "severity": "critical",
                "score": 0.9,
                "details": {
                    "reason": "tank_mismatch",
                    "expected_sales_l": float(expected),
                    "actual_drop_l": float(actual_drop),
                    "diff_l": float(diff),
                    "previous_reading": previous.measured_at.isoformat(),
                    "current_reading": current.measured_at.isoformat(),
                }
            }
        return None

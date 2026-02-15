# core/rules/under_dispense.py
from .base import BaseRule
from decimal import Decimal

class UnderDispenseRule(BaseRule):
    slug = "under_dispense"
    name = "Under-dispense"
    default_config = {
        "min_volume_l": 0.1,   # transactions smaller than this flagged
        "severity": "warning",
        "score": 0.5
    }

    def evaluate(self, transaction, ctx):
        vol = Decimal(transaction.volume_l or 0)
        min_v = Decimal(self.config.get("min_volume_l", 0.1))
        if vol < min_v:
            return {
                "severity": self.config.get("severity", "warning"),
                "score": float(self.config.get("score", 0.5)),
                "details": {"reason": "volume_below_min", "volume_l": float(vol), "min_l": float(min_v)}
            }
        return None

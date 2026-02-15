# backend/core/rules/rate_spike.py
from .registry import RuleBase
from django.utils import timezone
from datetime import timedelta
from django.db.models import Avg

class RateSpikeRule(RuleBase):
    slug = "rate_spike"
    name = "Rate Spike"
    description = "Detect sudden unit price spikes versus recent average"

    def evaluate(self, transaction):
        results = []
        window_minutes = int(self.config.get("window_minutes", 60))
        multiplier = float(self.config.get("multiplier", 1.5))
        since = timezone.now() - timedelta(minutes=window_minutes)
        recent = transaction.station.transactions.filter(created_at__gte=since)
        if not recent.exists():
            return results
        avg_price = recent.aggregate(Avg('unit_price'))['unit_price__avg'] or 0
        try:
            up = float(transaction.unit_price)
        except Exception:
            up = 0.0
        if avg_price > 0 and up > (avg_price * multiplier):
            details = {"reason":"rate_spike","unit_price":up,"avg_recent":avg_price,"multiplier":multiplier}
            results.append({"severity":"warning","details":details,"score":0.7})
        return results

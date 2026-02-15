# backend/core/rules/rapid_fire.py
from .registry import RuleBase
from django.utils import timezone
from datetime import timedelta

class RapidFireRule(RuleBase):
    slug = "rapid_fire"
    name = "Rapid Fire"
    description = "Many transactions on same pump within short window"

    def evaluate(self, transaction):
        results = []
        window_seconds = int(self.config.get("window_seconds", 10))
        threshold = int(self.config.get("count_threshold", 3))
        if not transaction.pump:
            return results
        since = timezone.now() - timedelta(seconds=window_seconds)
        recent_count = transaction.pump.transactions.filter(created_at__gte=since).count()
        if recent_count >= threshold:
            details = {"reason":"rapid_fire", "recent_count": recent_count, "window_seconds": window_seconds}
            results.append({"severity":"warning","details":details,"score":0.6})
        return results

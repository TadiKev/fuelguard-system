# core/management/commands/seed_anomalies.py
import random
import uuid
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from datetime import timedelta

from core.models import Station, Pump, Transaction, Anomaly, Rule
from django.contrib.auth import get_user_model

User = get_user_model()

DEFAULT_RULES = [
    ("under_dispense", "Under-dispense"),
    ("rate_spike", "Rate spike"),
    ("rapid_fire", "Rapid fire"),
    ("tank_mismatch", "Tank mismatch"),
]

class Command(BaseCommand):
    help = "Seed example anomalies for the first Station in DB. Useful for testing UI."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=5, help="How many anomalies to create")
        parser.add_argument("--station-id", type=str, help="Specific station UUID to seed into")
        parser.add_argument("--user", type=str, help="username to mark as acknowledged/resolved actor (optional)")
        parser.add_argument("--dry-run", action="store_true", help="Don't persist, only print what would be created")

    def handle(self, *args, **options):
        count = options["count"]
        station_id = options.get("station_id")
        dry = options.get("dry_run")
        username = options.get("user")

        station = None
        if station_id:
            try:
                station = Station.objects.get(id=station_id)
            except Station.DoesNotExist:
                raise CommandError(f"Station {station_id} not found")
        else:
            station = Station.objects.first()

        if not station:
            raise CommandError("No Station found. Create a station first or pass --station-id.")

        pumps = list(station.pumps.all())
        txns = list(Transaction.objects.filter(station=station).order_by("-created_at")[:50])

        actor = None
        if username:
            actor = User.objects.filter(username=username).first()

        created = []
        for i in range(count):
            # pick rule
            rule_slug, rule_name = random.choice(DEFAULT_RULES)
            severity = random.choice(["warning", "critical", "info"])
            score = round(random.uniform(0.3, 0.95), 2)

            # pick a transaction or pump (prefer a real transaction)
            tx = random.choice(txns) if txns else None
            pump = (tx.pump if tx and getattr(tx, "pump", None) else (random.choice(pumps) if pumps else None))

            details = {}
            if rule_slug == "under_dispense":
                vol = float(getattr(tx, "volume_l", random.uniform(0.01, 0.5) if tx else random.uniform(0.01, 0.5)))
                details = {"reason": "volume_below_min", "volume_l": vol, "min_l": 0.1}
            elif rule_slug == "rate_spike":
                up = float(getattr(tx, "unit_price", random.uniform(1.0, 3.0)))
                avg = round(up / random.uniform(1.6, 2.2), 2)
                details = {"reason": "rate_spike", "unit_price": up, "avg_recent": avg}
            elif rule_slug == "rapid_fire":
                details = {"reason": "rapid_fire", "recent_count": random.randint(3, 10), "window_seconds": 15}
            elif rule_slug == "tank_mismatch":
                details = {"reason": "tank_level_low", "tank_level_l": random.randint(0, 10), "tx_vol_l": float(getattr(tx, "volume_l", 20))}

            anomaly = Anomaly(
                station = station,
                pump = pump,
                transaction = tx,
                rule = rule_slug,
                name = rule_name,
                severity = severity,
                score = score,
                details = details,
                created_at = timezone.now() - timedelta(minutes=random.randint(0, 120)),
            )

            if dry:
                self.stdout.write(self.style.NOTICE(f"[dryrun] would create anomaly: rule={rule_slug} severity={severity} pump={getattr(pump,'id',None)} tx={getattr(tx,'id',None)} details={details}"))
            else:
                anomaly.save()
                created.append(anomaly)
                self.stdout.write(self.style.SUCCESS(f"Created anomaly {anomaly.id} rule={rule_slug} pump={getattr(pump,'pump_number',pump and str(pump.id))} tx={getattr(tx,'id',None)}"))

            # randomly acknowledge or resolve some
            if not dry and created and random.random() < 0.3 and actor:
                a = created[-1]
                a.acknowledge(user=actor if random.random() < 0.6 else None)
                if random.random() < 0.2:
                    a.resolve(user=actor)

        self.stdout.write(self.style.SUCCESS(f"Done. Created {len(created)} anomalies for station {station.id}"))
        if created:
            self.stdout.write("Example HTTP call to list anomalies for station:")
            self.stdout.write(f"curl -H 'Authorization: Bearer <TOKEN>' 'http://localhost:8000/api/v1/anomalies/?station={station.id}&unacked=true'")


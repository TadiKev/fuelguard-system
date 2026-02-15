# core/management/commands/seed_demo.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from decimal import Decimal
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = "Wipe demo data and seed a clean demo with a deliberate tank_mismatch anomaly."

    def handle(self, *args, **options):
        from core.models import (
            Station, Pump, Tank, TankReading,
            Transaction, Receipt, AuditLog, Rule, Anomaly, User, Profile
        )

        now = timezone.now()

        self.stdout.write(self.style.WARNING("1/6 — Deleting old demo objects (Anomaly, AuditLog, Receipt, Transaction, TankReading, Tank, Pump, Station, Rule) ..."))
        # delete in safe order
        Anomaly.objects.all().delete()
        AuditLog.objects.all().delete()
        Receipt.objects.all().delete()
        Transaction.objects.all().delete()
        TankReading.objects.all().delete()
        Tank.objects.all().delete()
        Pump.objects.all().delete()
        Station.objects.all().delete()
        Rule.objects.all().delete()

        # create demo user (do not overwrite if exists)
        demo_username = "demo"
        demo_password = "demo123"
        demo_user, created = User.objects.get_or_create(username=demo_username, defaults={"email": "demo@example.com"})
        if created:
            demo_user.set_password(demo_password)
            demo_user.is_staff = True
            demo_user.save()
            self.stdout.write(self.style.SUCCESS(f"Created demo user: {demo_username} / {demo_password}"))
        else:
            self.stdout.write(self.style.NOTICE(f"Demo user exists: {demo_username} (password unchanged)."))

        # create profile if missing
        try:
            Profile.objects.get_or_create(user=demo_user, defaults={"role": "admin"})
        except Exception:
            pass

        self.stdout.write(self.style.WARNING("2/6 — Creating station, pump and tank ..."))
        station = Station.objects.create(name="Demo Station", code="DEMO-ST-001", owner=demo_user, timezone="UTC")
        pump = Pump.objects.create(station=station, pump_number=1, nozzle_id="NOZ-1", fuel_type="Diesel", calibration_factor=Decimal("1.0"), status="online", last_heartbeat=now)
        # Tank baseline: capacity 10,000L and current level 8,000L at T0
        tank = Tank.objects.create(station=station, fuel_type="Diesel", capacity_l=Decimal("10000.000"), current_level_l=Decimal("8000.000"), last_read_at=now - timedelta(minutes=10))

        # create T0 tank reading (baseline)
        t0_time = now - timedelta(minutes=10)
        t0_level = Decimal("8000.000")
        t0 = TankReading.objects.create(tank=tank, level_l=t0_level, measured_at=t0_time, source="seed")

        self.stdout.write(self.style.SUCCESS(f"Station: {station.id}  Pump: {pump.id}  Tank: {tank.id}"))
        self.stdout.write(self.style.SUCCESS(f"T0 reading created: {t0.id} level={t0_level} at {t0_time.isoformat()}"))

        self.stdout.write(self.style.WARNING("3/6 — Creating demo transactions (these will be 'completed') ..."))
        # Create 3 transactions between T0 and T1 that sum to 600L -> 200+250+150 = 600
        txs = []
        volumes = [Decimal("200.000"), Decimal("250.000"), Decimal("150.000")]
        unit_price = Decimal("1.50")  # price/unit just for receipts
        ts_base = t0_time + timedelta(minutes=1)
        for i, vol in enumerate(volumes):
            ts = ts_base + timedelta(minutes=i)
            tx = Transaction.objects.create(
                station=station,
                pump=pump,
                attendant=demo_user,
                timestamp=ts,
                volume_l=vol,
                unit_price=unit_price,
                total_amount=(vol * unit_price).quantize(Decimal("0.01")),
                status="completed",
            )
            # create receipt for each tx to match normal flow
            Receipt.objects.create(transaction=tx, station=station, amount=(vol * unit_price).quantize(Decimal("0.01")))
            txs.append(tx)
            self.stdout.write(self.style.SUCCESS(f"Created tx {tx.id} vol={vol} @ {ts.isoformat()}"))

        total_dispensed = sum([t.volume_l for t in txs])
        self.stdout.write(self.style.NOTICE(f"Total dispensed in demo TXs: {total_dispensed} L"))

        self.stdout.write(self.style.WARNING("4/6 — Creating T1 reading with deliberate mismatch ..."))
        # T1: set tank reading to 7,500L (so expected_level = T0 - 600 = 7400, actual=7500 => delta = -100 L)
        t1_time = now
        t1_level = Decimal("7500.000")
        t1 = TankReading.objects.create(tank=tank, level_l=t1_level, measured_at=t1_time, source="seed")
        # update tank current fields to reflect sensor reading
        tank.current_level_l = t1_level
        tank.last_read_at = t1_time
        tank.save(update_fields=["current_level_l", "last_read_at"])

        self.stdout.write(self.style.SUCCESS(f"T1 reading created: {t1.id} level={t1_level} at {t1_time.isoformat()}"))

        self.stdout.write(self.style.WARNING("5/6 — Running simple tank_mismatch detector and creating an Anomaly if threshold crossed ..."))
        # Simple detection logic (same as your manual calculations)
        S = total_dispensed  # sum of volumes between T0 and T1
        expected_level = (t0_level - S).quantize(Decimal("0.001"))
        actual_level = t1_level
        delta_l = (expected_level - actual_level).quantize(Decimal("0.001"))
        capacity = tank.capacity_l or Decimal("1.0")
        delta_percent = (abs(delta_l) / Decimal(capacity) * Decimal("100")).quantize(Decimal("0.0001"))

        # threshold: flag if abs(delta_l) > 50 OR delta_percent > 0.2%
        flag = (abs(delta_l) > Decimal("50")) or (delta_percent > Decimal("0.2"))

        self.stdout.write(self.style.NOTICE(f"Computed S={S}L, expected_level={expected_level}L, actual_level={actual_level}L, delta={delta_l}L, delta_percent={delta_percent}%"))
        if flag:
            rule, _ = Rule.objects.get_or_create(slug="tank_mismatch", defaults={"name": "Tank mismatch", "rule_type": "tank_mismatch", "description": "Auto-created demo rule"})
            details = {
                "expected_level": str(expected_level),
                "actual_level": str(actual_level),
                "delta_l": str(delta_l),
                "delta_percent": str(delta_percent),
                "transactions_considered": [str(t.id) for t in txs],
                "t0": {"reading_id": str(t0.id), "measured_at": t0_time.isoformat(), "level": str(t0_level)},
                "t1": {"reading_id": str(t1.id), "measured_at": t1_time.isoformat(), "level": str(t1_level)},
            }
            an = Anomaly.objects.create(
                station=station,
                pump=pump,
                rule="tank_mismatch",
                name="Tank level mismatch (demo)",
                severity="critical" if abs(delta_l) > Decimal("200") else "warning",
                score=float(abs(delta_l)),
                details=details,
            )
            self.stdout.write(self.style.SUCCESS(f"Anomaly created: {an.id} (rule=tank_mismatch)"))
        else:
            self.stdout.write(self.style.NOTICE("No anomaly flagged by demo detector (threshold not met)."))

        # small audit log
        AuditLog.objects.create(actor=demo_user, action="demo.seed", target_type="Station", target_id=str(station.id), payload={"summary": "seed_demo run"})

        self.stdout.write(self.style.SUCCESS("6/6 — Done. Summary:"))
        self.stdout.write(self.style.SUCCESS(f"  station.id = {station.id}"))
        self.stdout.write(self.style.SUCCESS(f"  pump.id    = {pump.id}"))
        self.stdout.write(self.style.SUCCESS(f"  tank.id    = {tank.id}"))
        self.stdout.write(self.style.SUCCESS(f"  t0_reading = {t0.id}  level={t0_level} @ {t0_time.isoformat()}"))
        self.stdout.write(self.style.SUCCESS(f"  t1_reading = {t1.id}  level={t1_level} @ {t1_time.isoformat()}"))
        self.stdout.write(self.style.SUCCESS(f"  transactions = {[str(t.id) for t in txs]}  total_dispensed={total_dispensed}L"))
        if flag:
            self.stdout.write(self.style.SUCCESS(f"  anomaly.id = {an.id}  delta_l={delta_l}L  delta_percent={delta_percent}%"))
        else:
            self.stdout.write(self.style.NOTICE("  no anomaly created by the detector."))

        self.stdout.write(self.style.MIGRATE_HEADING("Seed complete — use demo/demo123 to login if needed."))

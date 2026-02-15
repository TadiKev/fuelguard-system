import random
import time
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import Pump, Station, Transaction, User
from core.serializers import TransactionCreateSerializer

class Command(BaseCommand):
    help = "Simulate random transaction events for existing pumps"

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=10, help='Number of events to simulate')
        parser.add_argument('--interval', type=float, default=0.5, help='Seconds between events')

    def handle(self, *args, **options):
        count = options['count']
        interval = options['interval']
        pumps = list(Pump.objects.all())
        if not pumps:
            self.stdout.write(self.style.ERROR('No pumps found. Create a station and pumps first.'))
            return
        attendants = list(User.objects.filter(profile__role='attendant'))
        for i in range(count):
            pump = random.choice(pumps)
            station = pump.station
            attendant = random.choice(attendants) if attendants else None
            volume = round(random.uniform(0.1, 50.0), 3)
            unit_price = round(random.uniform(0.80, 2.50), 3)
            data = {
                "station": station.id,
                "pump": pump.id,
                "attendant": attendant.id if attendant else None,
                "timestamp": timezone.now().isoformat(),
                "volume_l": volume,
                "unit_price": unit_price,
                "total_amount": round(volume * unit_price, 2),
                "raw_event": {"sim": True}
            }
            serializer = TransactionCreateSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            tx = serializer.save()
            self.stdout.write(self.style.SUCCESS(f"Simulated tx {tx.id} station={station.code} pump={pump.pump_number} vol={volume}"))
            time.sleep(interval)

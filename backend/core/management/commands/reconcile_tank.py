# core/management/commands/reconcile_tank.py
from django.core.management.base import BaseCommand
from core.tasks import reconcile_tank_sales_sync

class Command(BaseCommand):
    help = "Run tank reconcile synchronously (for testing)."

    def add_arguments(self, parser):
        parser.add_argument("tank_id", type=str, help="Tank UUID to reconcile")
        parser.add_argument("--window-hours", type=int, default=None, dest="window_hours",
                            help="Optional window in hours to look back (overrides default).")
        parser.add_argument("--tolerance", type=float, default=None, dest="tolerance",
                            help="Tolerance in liters for mismatch (overrides default).")

    def handle(self, *args, **options):
        tank_id = options["tank_id"]
        window_hours = options.get("window_hours")
        tolerance = options.get("tolerance")

        # pass CLI names (window_hours) and tolerance to sync function (it's compatible)
        result = reconcile_tank_sales_sync(tank_id, window_hours=window_hours, tolerance_l=tolerance if tolerance is not None else 5.0)
        self.stdout.write(str(result))

# core/admin.py
from django.contrib import admin
from .models import (
    User,
    Profile,
    Station,
    Pump,
    Tank,
    TankReading,
    Transaction,
    Receipt,
    AuditLog,
    Rule,
    Anomaly,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "username", "email", "is_staff", "is_active")
    search_fields = ("username", "email")
    list_filter = ("is_staff", "is_active")


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "role", "station")
    search_fields = ("user__username", "user__email")
    list_filter = ("role", "station")


@admin.register(Station)
class StationAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "code", "owner", "created_at")
    search_fields = ("name", "code", "owner__username")
    list_filter = ("timezone",)


@admin.register(Pump)
class PumpAdmin(admin.ModelAdmin):
    # Pump has pump_number, nozzle_id, fuel_type, station, status, last_heartbeat, created_at
    list_display = ("id", "pump_number", "station", "fuel_type", "status", "last_heartbeat", "created_at")
    list_filter = ("station", "fuel_type", "status")
    search_fields = ("pump_number", "nozzle_id", "station__name")
    ordering = ("station", "pump_number")


@admin.register(Tank)
class TankAdmin(admin.ModelAdmin):
    list_display = ("id", "station", "fuel_type", "capacity_l", "current_level_l", "last_read_at", "created_at")
    list_filter = ("station", "fuel_type")
    search_fields = ("station__name",)


@admin.register(TankReading)
class TankReadingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "tank",
        "level_l",
        "measured_at",
        "source",
        "created_at",
    )
    list_filter = ("tank", "source", "measured_at")
    search_fields = ("tank__id", "tank__station__name")
    ordering = ("-measured_at",)
    date_hierarchy = "measured_at"


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    # Transaction fields: id, station, pump, attendant, timestamp, volume_l, unit_price, total_amount, status, created_at
    list_display = ("id", "station", "pump", "attendant", "timestamp", "volume_l", "total_amount", "status", "created_at")
    list_filter = ("station", "status", "created_at")
    search_fields = ("id", "external_tx_ref", "attendant__username", "pump__pump_number")


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    # Receipt fields: id, transaction (OneToOne), station, amount, issued_at, method, sent_to, sent_at, receipt_token
    list_display = ("id", "transaction", "station", "amount", "issued_at", "method", "sent_to", "sent_at")
    list_filter = ("method", "issued_at", "sent_at")
    search_fields = ("id", "transaction__id", "receipt_token")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("id", "action", "actor", "target_type", "target_id", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("actor__username", "target_id", "action")


@admin.register(Rule)
class RuleAdmin(admin.ModelAdmin):
    # Rule fields: id, name, slug, rule_type, enabled, created_at
    list_display = ("id", "name", "slug", "rule_type", "enabled", "created_at")
    list_filter = ("enabled", "rule_type", "created_at")
    search_fields = ("name", "slug")


@admin.register(Anomaly)
class AnomalyAdmin(admin.ModelAdmin):
    # Anomaly fields: id, station, pump, transaction, rule, name, severity, score, created_at, acknowledged, resolved
    list_display = ("id", "rule", "name", "station", "pump", "severity", "score", "created_at", "acknowledged", "resolved")
    list_filter = ("rule", "severity", "acknowledged", "resolved", "created_at")
    search_fields = ("station__id", "pump__id", "transaction__id", "rule")

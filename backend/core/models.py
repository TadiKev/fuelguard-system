import uuid
import json
import hmac
import hashlib
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.utils import timezone
import base64
from decimal import Decimal
from datetime import timedelta
from django.conf import settings
from django.utils import timezone

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True, null=True)

class Profile(models.Model):
    ROLE_CHOICES = [
        ('admin','Admin'),
        ('station_owner','StationOwner'),
        ('attendant','Attendant'),
        ('regulator','Regulator'),
        ('inspector','Inspector'),
        ('customer','Customer'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=32, choices=ROLE_CHOICES)
    station = models.ForeignKey('Station', null=True, blank=True, on_delete=models.SET_NULL)
    metadata = models.JSONField(default=dict, blank=True)

# ---------------------------
# Station / Pump / Tank
# ---------------------------
class Station(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64, unique=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='stations')
    location = models.JSONField(default=dict, blank=True)  # lat,long,address
    timezone = models.CharField(max_length=64, default='UTC')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)



class Pump(models.Model):
    STATUS_CHOICES = [
        ("online", "online"),
        ("offline", "offline"),
        ("maintenance", "maintenance"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(
        "Station", on_delete=models.CASCADE, related_name="pumps"
    )
    pump_number = models.PositiveIntegerField()
    nozzle_id = models.CharField(max_length=64, blank=True, null=True)
    fuel_type = models.CharField(max_length=64, blank=True, null=True)
    calibration_factor = models.DecimalField(
        max_digits=12, decimal_places=6, default=1.0
    )

    # existing 'status' field (keeps choices) — you can still set this manually for maintenance
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default="online", help_text="Logical pump status"
    )

    # New field: last_heartbeat — used to determine 'online' state
    last_heartbeat = models.DateTimeField(
        null=True, blank=True, help_text="Last seen timestamp from pump/agent or events"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("station", "pump_number")
        ordering = ("station", "pump_number")
        verbose_name = "Pump"
        verbose_name_plural = "Pumps"

    def __str__(self):
        return f"Pump {self.pump_number} @ {self.station_id or 'unknown'}"

    @property
    def is_online(self) -> bool:
        """
        Consider pump online if last_heartbeat is recent (PUMP_ONLINE_SECONDS in settings,
        default 120 seconds). If last_heartbeat is None, return False.
        """
        if not self.last_heartbeat:
            return False
        try:
            threshold = int(getattr(settings, "PUMP_ONLINE_SECONDS", 120))
        except Exception:
            threshold = 120
        return (timezone.now() - self.last_heartbeat) < timedelta(seconds=threshold)

    @property
    def status_label(self) -> str:
        """
        Prefer the explicit `status` (maintenance etc). If status is 'online'/'offline'
        we can combine with heartbeat detection for live status:
        - If status == 'maintenance' -> 'maintenance'
        - Else return 'online' if is_online True, otherwise 'offline'
        """
        try:
            if str(self.status).lower() == "maintenance":
                return "maintenance"
        except Exception:
            pass
        return "online" if self.is_online else "offline"

    def mark_heartbeat(self, when=None, save=True):
        """
        Helper to mark pump heartbeat from code: pump.mark_heartbeat()
        """
        self.last_heartbeat = when or timezone.now()
        if save:
            self.save(update_fields=["last_heartbeat", "updated_at"])
        return self.last_heartbeat


class Tank(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name='tanks')
    fuel_type = models.CharField(max_length=64)
    capacity_l = models.DecimalField(max_digits=14, decimal_places=3)
    current_level_l = models.DecimalField(max_digits=14, decimal_places=3)
    last_read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class TankReading(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tank = models.ForeignKey(Tank, on_delete=models.CASCADE, related_name='readings')
    level_l = models.DecimalField(max_digits=12, decimal_places=3, help_text="Reported current liters in tank")
    measured_at = models.DateTimeField(default=timezone.now)
    source = models.CharField(max_length=64, blank=True, help_text="device/manual")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-measured_at']

    def __str__(self):
        return f"TankReading {self.tank} @ {self.measured_at.isoformat()} = {self.level_l}L"

# ---------------------------
# Transaction, Receipt, Audit, Anomaly, Rule
# ---------------------------
class Transaction(models.Model):
    STATUS = [('pending','pending'),('completed','completed'),('void','void')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name='transactions')
    pump = models.ForeignKey(Pump, on_delete=models.SET_NULL, null=True, related_name='transactions')
    attendant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='transactions')
    customer_phone = models.CharField(max_length=32, blank=True, null=True)
    timestamp = models.DateTimeField(default=timezone.now)
    volume_l = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=4)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    external_tx_ref = models.CharField(max_length=128, blank=True, null=True)
    # NOTE: Do NOT define a OneToOne on Transaction side — Receipt has the OneToOne.
    status = models.CharField(max_length=16, choices=STATUS, default='pending')
    raw_event = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# assume Station and Transaction exist in same module or imported above
# from .models import Station, Transaction  <-- not needed if in same file

class Receipt(models.Model):
    """
    Receipt model with server-side signature (HMAC-SHA256) for tamper-evidence.
    - The signature covers: id|transaction_id|station_id|amount|issued_at_unix
    - receipt_token is an opaque token (base64 of id:signature) safe to give to clients.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction = models.OneToOneField(
        "Transaction",
        on_delete=models.CASCADE,
        related_name="receipt"
    )

    # Duplicate minimal verification data so verification can be done without joins
    station = models.ForeignKey(
        "Station",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Denormalized station for quick verification"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    issued_at = models.DateTimeField(default=timezone.now, help_text="UTC timestamp when receipt was issued")

    # cryptographic signature (HMAC-SHA256) hex digest
    signature = models.CharField(max_length=128, blank=True, editable=False, db_index=True)

    # An opaque token safe to return to customers; format: base64("{id}:{signature}")
    receipt_token = models.CharField(max_length=512, unique=True)

    # delivery metadata (same as your original model)
    sent_to = models.CharField(max_length=255, blank=True, null=True)
    method = models.CharField(max_length=16, choices=[('sms','sms'),('email','email')], default='sms')
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-issued_at",)

    def __str__(self):
        return f"Receipt {self.id} for tx {self.transaction_id if hasattr(self,'transaction_id') else self.transaction.pk}"

    # ---------- signing helpers ----------
    def _payload_str(self):
        """
        Deterministic string used for HMAC. Keep format stable.
        Note: we use int(issued_at.timestamp()) for compactness.
        """
        tx_id = str(self.transaction_id if hasattr(self, "transaction_id") else self.transaction.pk)
        station_id = str(self.station_id) if self.station_id else ""
        issued_unix = int(self.issued_at.timestamp())
        # Ensure amount string is normalized (two decimals)
        amount_str = f"{Decimal(self.amount):.2f}"
        return f"{self.id}|{tx_id}|{station_id}|{amount_str}|{issued_unix}"

    def sign(self):
        """
        Compute HMAC-SHA256 over payload using SECRET_KEY and set signature field.
        Returns the hex signature.
        """
        secret = settings.SECRET_KEY.encode("utf-8")
        payload = self._payload_str().encode("utf-8")
        digest = hmac.new(secret, payload, hashlib.sha256).hexdigest()
        self.signature = digest
        return digest

    def generate_receipt_token(self):
        """
        Create a compact token safe to hand to external clients.
        Format: base64url("{id}:{signature}")
        """
        if not self.signature:
            self.sign()
        raw = f"{self.id}:{self.signature}".encode("utf-8")
        token = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
        self.receipt_token = token
        return token

    def to_payload_dict(self):
        """
        Return canonical dict representation for clients to verify (if needed).
        Note: issued_at returned as integer unix timestamp for compactness.
        """
        return {
            "id": str(self.id),
            "transaction_id": str(self.transaction.pk),
            "station_id": str(self.station.pk) if self.station else None,
            "amount": f"{self.amount:.2f}",
            "issued_at": int(self.issued_at.timestamp()),
            "signature": self.signature,
            "receipt_token": self.receipt_token,
        }

    def verify_signature(self, signature_to_check: str = None) -> bool:
        """
        Verify the given signature (or self.signature) against recomputed HMAC.
        Uses timing-safe compare.
        """
        if signature_to_check is None:
            signature_to_check = self.signature
        recomputed = hmac.new(settings.SECRET_KEY.encode("utf-8"),
                              self._payload_str().encode("utf-8"),
                              hashlib.sha256).hexdigest()
        return hmac.compare_digest(recomputed, signature_to_check or "")

    # ---------- model save behavior ----------
    def save(self, *args, **kwargs):
        """
        Ensure amount, station, signature and receipt_token are set before first save.
        - If amount is zero or None, try to read from related transaction.
        - If station is not set, try to set from transaction.station.
        - Compute signature and token if not present.
        """
        # populate amount and station from transaction if missing / zero
        try:
            if (not self.amount or Decimal(self.amount) == Decimal("0.00")) and getattr(self, "transaction", None):
                # transaction may have total_amount
                tx_amt = getattr(self.transaction, "total_amount", None)
                if tx_amt is not None:
                    self.amount = Decimal(tx_amt)
            if not self.station and getattr(self, "transaction", None):
                self.station = getattr(self.transaction, "station", None)
        except Exception:
            # defensive: if transaction not linked yet or fields missing, continue
            pass

        # set issued_at if not set
        if not self.issued_at:
            self.issued_at = timezone.now()

        # compute signature if missing
        if not self.signature:
            self.sign()

        # compute receipt_token if missing or empty
        if not self.receipt_token:
            self.generate_receipt_token()

        super().save(*args, **kwargs)

    # ---------- convenience / class helpers ----------
    @classmethod
    def verify_token(cls, token: str):
        """
        Given a receipt_token (base64 id:signature), decode, fetch stored receipt and verify.
        Returns (valid: bool, receipt_instance_or_reason)
        """
        try:
            # add padding for base64
            padding = "=" * ((4 - len(token) % 4) % 4)
            raw = base64.urlsafe_b64decode(token + padding).decode("utf-8")
            rid, sig = raw.split(":", 1)
        except Exception as e:
            return False, "bad_token_format"

        try:
            r = cls.objects.get(pk=rid)
        except cls.DoesNotExist:
            return False, "unknown_receipt"

        ok = r.verify_signature(sig)
        return bool(ok), r if ok else "signature_mismatch"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=128)
    target_type = models.CharField(max_length=64, blank=True, null=True)
    target_id = models.CharField(max_length=128, blank=True, null=True)
    payload = models.JSONField(default=dict, blank=True)
    signature = models.CharField(max_length=512, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # sign payload using SECRET_KEY HMAC for basic tamper evidence
        secret = settings.SECRET_KEY.encode('utf-8')
        msg = (json.dumps(self.payload, sort_keys=True, default=str)).encode('utf-8')
        self.signature = hmac.new(secret, msg, hashlib.sha256).hexdigest()
        super().save(*args, **kwargs)

class Rule(models.Model):
    RULE_TYPES = [
        ('tank_mismatch','tank_mismatch'),
        ('under_dispense','under_dispense'),
        ('rate_spike','rate_spike'),
        ('rapid_fire','rapid_fire'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=128, unique=True)
    description = models.TextField(blank=True)
    rule_type = models.CharField(max_length=64, choices=RULE_TYPES)
    config = models.JSONField(default=dict, blank=True)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)



class Anomaly(models.Model):
    SEVERITY_CHOICES = [
        ('info', 'info'),
        ('warning', 'warning'),
        ('critical', 'critical'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # origin references
    station = models.ForeignKey('Station', on_delete=models.CASCADE, related_name='anomalies', null=True, blank=True)
    pump = models.ForeignKey('Pump', on_delete=models.CASCADE, related_name='anomalies', null=True, blank=True)
    transaction = models.ForeignKey('Transaction', on_delete=models.SET_NULL, related_name='anomalies', null=True, blank=True)

    rule = models.CharField(max_length=128, null=True, blank=True, help_text="Rule slug that created this anomaly")
    name = models.CharField(max_length=255, blank=True)
    severity = models.CharField(max_length=16, choices=SEVERITY_CHOICES, default='warning')
    score = models.FloatField(null=True, blank=True)

    # store arbitrary details (reason, counters, metadata)
    details = models.JSONField(default=dict, blank=True)

    # lifecycle
    created_at = models.DateTimeField(auto_now_add=True)
    acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='acknowledged_anomalies')
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='resolved_anomalies')
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['station']),
            models.Index(fields=['pump']),
            models.Index(fields=['transaction']),
            models.Index(fields=['rule']),
        ]

    def acknowledge(self, user=None):
        if not self.acknowledged:
            self.acknowledged = True
            self.acknowledged_by = user or None
            self.acknowledged_at = timezone.now()
            self.save(update_fields=['acknowledged', 'acknowledged_by', 'acknowledged_at'])

    def resolve(self, user=None):
        if not self.resolved:
            self.resolved = True
            self.resolved_by = user or None
            self.resolved_at = timezone.now()
            self.save(update_fields=['resolved', 'resolved_by', 'resolved_at'])

    def to_dict(self):
        return {
            "id": str(self.id),
            "station": str(self.station_id) if self.station_id else None,
            "pump": str(self.pump_id) if self.pump_id else None,
            "transaction": str(self.transaction_id) if self.transaction_id else None,
            "rule": self.rule,
            "name": self.name,
            "severity": self.severity,
            "score": self.score,
            "details": self.details,
            "acknowledged": self.acknowledged,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolved": self.resolved,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "created_at": self.created_at.isoformat(),
        }

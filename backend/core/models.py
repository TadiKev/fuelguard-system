import uuid
import json
import hmac
import hashlib
from django.db import models, transaction
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.utils import timezone

# ---------------------------
# User & Profile
# ---------------------------
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
    STATUS_CHOICES = [('online','online'),('offline','offline'),('maintenance','maintenance')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name='pumps')
    pump_number = models.PositiveIntegerField()
    nozzle_id = models.CharField(max_length=64, blank=True, null=True)
    fuel_type = models.CharField(max_length=64)
    calibration_factor = models.DecimalField(max_digits=12, decimal_places=6, default=1.0)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='online')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('station','pump_number')

class Tank(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name='tanks')
    fuel_type = models.CharField(max_length=64)
    capacity_l = models.DecimalField(max_digits=14, decimal_places=3)
    current_level_l = models.DecimalField(max_digits=14, decimal_places=3)
    last_read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

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
    receipt = models.OneToOneField('Receipt', on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS, default='pending')
    raw_event = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Receipt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction = models.OneToOneField(Transaction, on_delete=models.CASCADE, related_name='receipt_record')
    receipt_token = models.CharField(max_length=512, unique=True)
    sent_to = models.CharField(max_length=255, blank=True, null=True)
    method = models.CharField(max_length=16, choices=[('sms','sms'),('email','email')], default='sms')
    sent_at = models.DateTimeField(null=True, blank=True)

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
    SEVERITY = [('info','info'),('warning','warning'),('critical','critical')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name='anomalies')
    transaction = models.ForeignKey(Transaction, on_delete=models.SET_NULL, null=True, blank=True, related_name='anomalies')
    pump = models.ForeignKey(Pump, on_delete=models.SET_NULL, null=True, blank=True)
    rule = models.ForeignKey(Rule, on_delete=models.SET_NULL, null=True)
    severity = models.CharField(max_length=16, choices=SEVERITY, default='warning')
    score = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    acknowledged = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

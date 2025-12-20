import uuid
import json
from django.conf import settings
from django.core import signing
from rest_framework import serializers
from .models import Station, Pump, Transaction, Receipt, AuditLog, Rule, Anomaly, User

class StationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Station
        fields = '__all__'

class PumpSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pump
        fields = '__all__'

class TransactionCreateSerializer(serializers.ModelSerializer):
    external_id = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Transaction
        fields = ['id','station','pump','attendant','timestamp','volume_l','unit_price','total_amount','external_tx_ref','raw_event','status','external_id']
        read_only_fields = ['id','status']

    def validate(self, data):
        # ensure station/pump consistency
        pump = data.get('pump')
        station = data.get('station')
        if pump and station and pump.station_id != station.id:
            raise serializers.ValidationError("Pump does not belong to station")
        # compute total if missing
        if data.get('total_amount') is None:
            data['total_amount'] = (data['volume_l'] * data['unit_price'])
        return data

    def create(self, validated_data):
        from django.db import transaction as db_transaction
        from .tasks import publish_transaction_event, evaluate_transaction_rules
        # keep raw_event separate if provided
        raw = validated_data.pop('raw_event', {})
        external = validated_data.pop('external_id', None)
        with db_transaction.atomic():
            tx = Transaction.objects.create(raw_event=raw, external_tx_ref=external, **validated_data)
            # create audit log
            AuditLog.objects.create(actor=tx.attendant if tx.attendant else None,
                                    action='transaction.created',
                                    target_type='Transaction',
                                    target_id=str(tx.id),
                                    payload={'transaction_id': str(tx.id), 'station': str(tx.station_id)})
            # create receipt token and receipt row (receipt will be sent by Celery)
            token_payload = {'transaction_id': str(tx.id), 'ts': str(tx.timestamp)}
            receipt_token = signing.dumps(token_payload, key=settings.SECRET_KEY)
            receipt = Receipt.objects.create(transaction=tx, receipt_token=receipt_token)
            tx.receipt = receipt
            tx.status = 'completed'
            tx.save(update_fields=['receipt','status','updated_at'])

            # publish event to redis or queue for rule engine
            event = {
                "event_type":"transaction.created",
                "transaction_id": str(tx.id),
                "station_id": str(tx.station_id),
                "pump_id": str(tx.pump_id) if tx.pump else None,
                "attendant_id": str(tx.attendant_id) if tx.attendant else None,
                "timestamp": tx.timestamp.isoformat(),
                "volume_l": float(tx.volume_l),
                "unit_price": float(tx.unit_price),
                "total_amount": float(tx.total_amount),
                "raw_event": raw
            }
            publish_transaction_event.delay(event)     # publish to redis
            evaluate_transaction_rules.delay(str(tx.id))  # run rule engine async
        return tx

class ReceiptVerifySerializer(serializers.Serializer):
    token = serializers.CharField()

    def validate_token(self, value):
        try:
            data = signing.loads(value, key=settings.SECRET_KEY)
            return data
        except Exception as e:
            raise serializers.ValidationError("Invalid token") from e

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'

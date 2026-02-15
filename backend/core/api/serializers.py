# core/api/serializers.py
from rest_framework import serializers
from core.models import Station  # adjust if Station is in different module
from core.models import Anomaly
from django.contrib.auth import get_user_model
from rest_framework import serializers
User = get_user_model()
from rest_framework import serializers
from core.models import Receipt

from core.models import Profile, Station 

User = get_user_model()

class StationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Station
        fields = ("id", "code", "name", "location", "created_at")  # adjust fields to your model
        read_only_fields = ("id", "created_at")

class AnomalySerializer(serializers.ModelSerializer):
    class Meta:
        model = Anomaly
        fields = ("id","station","transaction","severity","details","created_at")
        read_only_fields = ("id","created_at")


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "first_name", "last_name")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ReceiptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = ["id", "transaction_id", "station_id", "amount", "metadata", "issued_at", "signature"]
        read_only_fields = ["id", "issued_at", "signature"]



# core/api/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
from core.models import Profile, Station  # adjust import path if models live elsewhere

User = get_user_model()

class ProfileSerializer(serializers.ModelSerializer):
    # include the related station id + minimal station info for convenience
    station = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Profile
        fields = ("id", "role", "station", "metadata")

class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "profile")
        read_only_fields = ("id", "username", "email", "profile")

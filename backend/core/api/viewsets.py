# core/api/viewsets.py
from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from core.models import Station
from .serializers import StationSerializer
from core.models import Anomaly
from .serializers import AnomalySerializer

class StationViewSet(viewsets.ModelViewSet):
    queryset = Station.objects.all().order_by("code")
    serializer_class = StationSerializer
    permission_classes = [AllowAny]   # <-- dev: allow anonymous


class AnomalyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Anomaly.objects.all().order_by("-created_at")
    serializer_class = AnomalySerializer
    permission_classes = [AllowAny]

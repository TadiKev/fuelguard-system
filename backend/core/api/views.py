# core/api/views.py
from rest_framework import viewsets, permissions
from core.models import Station
from core.api.serializers import StationSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .serializers import RegisterSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from django.shortcuts import get_object_or_404

class StationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Expose stations for frontend dashboards (read-only).
    """
    queryset = Station.objects.all().order_by("code")
    serializer_class = StationSerializer
    permission_classes = [permissions.AllowAny]  # change to proper perms later



class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {"refresh": str(refresh), "access": str(refresh.access_token)},
            status=status.HTTP_201_CREATED,
        )

# core/api/views.py


# Try importing project models if they exist; otherwise set to None.
try:
    from core.models import Pump, Transaction, Anomaly, Station  # adjust if your models live elsewhere
except Exception:
    Pump = Transaction = Anomaly = Station = None

class PumpsByStation(APIView):
    """
    GET /api/v1/stations/<station_id>/pumps/  -> returns list or []
    """
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request, station_id):
        if Pump is None:
            return Response([], status=200)
        qs = Pump.objects.filter(station_id=station_id)
        # choose some common fields if present
        data = [
            {
                "id": str(p.id),
                "pump_number": getattr(p, "pump_number", None),
                "name": getattr(p, "name", None),
            }
            for p in qs
        ]
        return Response(data)


class TransactionsByStation(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request, station_id):
        if Transaction is None:
            return Response([], status=200)
        qs = Transaction.objects.filter(station_id=station_id).order_by("-created_at")[:50]
        data = [
            {
                "id": str(t.id),
                "pump": getattr(t, "pump_id", None),
                "total_amount": getattr(t, "total_amount", None),
                "volume_l": getattr(t, "volume_l", None),
                "created_at": getattr(t, "created_at", None),
            }
            for t in qs
        ]
        return Response(data)


class AnomaliesByStation(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request, station_id):
        if Anomaly is None:
            return Response([], status=200)
        qs = Anomaly.objects.filter(station_id=station_id).order_by("-created_at")[:50]
        data = [
            {
                "id": str(a.id),
                "message": getattr(a, "message", str(a)),
                "created_at": getattr(a, "created_at", None),
            }
            for a in qs
        ]
        return Response(data)

# core/api/views.py
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import viewsets, status
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model

from core.models import Profile
from .serializers import UserSerializer, ProfileSerializer

User = get_user_model()

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """
    Return logged in user with nested profile.
    Ensures frontend can read user.profile.role in a single request.
    """
    serializer = UserSerializer(request.user, context={"request": request})
    return Response(serializer.data)

# core/api/views.py
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import viewsets, status
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model

from core.models import Profile
from .serializers import UserSerializer, ProfileSerializer

User = get_user_model()

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """
    Return logged in user with nested profile.
    Ensures frontend can read user.profile.role in a single request.
    """
    serializer = UserSerializer(request.user, context={"request": request})
    return Response(serializer.data)

class ProfileViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only access to profiles.
    - list: admin only
    - retrieve: admin OR owner of the profile (we rely on default behavior + check)
    """
    queryset = Profile.objects.select_related("user", "station").all()
    serializer_class = ProfileSerializer

    def get_permissions(self):
        # list -> admin only; retrieve -> allow authenticated (but frontend will usually use /me/)
        if self.action == "list":
            perms = [IsAdminUser]
        else:
            perms = [IsAuthenticated]
        return [p() for p in perms]

    # convenience: GET /profiles/by_user/<user_id>/ -> profile for that user (if exists)
    @action(detail=False, methods=["get"], url_path=r"by_user/(?P<user_id>[^/.]+)")
    def by_user(self, request, user_id=None):
        try:
            profile = Profile.objects.get(user__id=user_id)
            serializer = self.get_serializer(profile)
            return Response(serializer.data)
        except Profile.DoesNotExist:
            return Response({"detail": "not found"}, status=status.HTTP_404_NOT_FOUND)

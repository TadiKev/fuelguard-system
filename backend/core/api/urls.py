# core/api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

# ViewSets and APIViews
from .viewsets import StationViewSet, AnomalyViewSet  # existing viewsets
from .views import (
    RegisterView,
    me,
    PumpsByStation,
    TransactionsByStation,
    AnomaliesByStation,
    ProfileViewSet,  # <- ensure this is imported
)

# Optional: small helper view for legacy frontend route if you still need it
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from core.models import Profile
from .serializers import ProfileSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def user_profile_detail(request, user_id):
    """
    Backwards-compatible endpoint:
      GET /api/v1/users/<user_id>/profile/
    (keep if frontend still requests this exact path)
    """
    profile = get_object_or_404(Profile, user__id=user_id)
    serializer = ProfileSerializer(profile, context={"request": request})
    return Response(serializer.data)


# --------------------------------------------------
# API ROUTER: register viewsets here
# --------------------------------------------------
router = DefaultRouter()
router.register(r"stations", StationViewSet, basename="station")
router.register(r"anomalies", AnomalyViewSet, basename="anomaly")

# <-- NEW: register profiles so '/profiles/me/' is available from ProfileViewSet.me()
router.register(r"profiles", ProfileViewSet, basename="profile")


# --------------------------------------------------
# URL PATTERNS
# --------------------------------------------------
urlpatterns = [
    # router-provided viewsets (includes /profiles/, /profiles/me/ via @action)
    path("", include(router.urls)),

    # JWT auth
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # registration + convenience endpoints
    path("register/", RegisterView.as_view(), name="auth_register"),
    path("me/", me, name="me"),
    path("stations/<uuid:station_id>/pumps/", PumpsByStation.as_view(), name="station-pumps"),
    path("stations/<uuid:station_id>/transactions/", TransactionsByStation.as_view(), name="station-transactions"),
    path("stations/<uuid:station_id>/anomalies/", AnomaliesByStation.as_view(), name="station-anomalies"),

    # legacy frontend profile route (optional; keeps /users/<id>/profile/ working)
    path("users/<uuid:user_id>/profile/", user_profile_detail, name="user-profile"),
]

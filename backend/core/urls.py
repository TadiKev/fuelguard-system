# core/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    RuleViewSet,
    PumpViewSet,
    ReceiptViewSet,
    AnomalyViewSet,
    TankViewSet,
    TransactionCreateView,
    TransactionDetailView,
    ReceiptVerifyView,
    EventIngestView,
    GenerateReceiptAPIView,
    VerifyReceiptAPIView,
    ReceiptListCreateAPIView,
    MeAPIView,
    LogoutAPIView,
    ReceiptSendSMSAPIView,
    TankReadingsList,
    StationViewSet,
    ReconcileStationAPIView,
)

router = DefaultRouter()
router.register(r"stations", StationViewSet, basename="station")
router.register(r"rules", RuleViewSet, basename="rules")
router.register(r"pumps", PumpViewSet, basename="pumps")
router.register(r"receipts", ReceiptViewSet, basename="receipts")
router.register(r"anomalies", AnomalyViewSet, basename="anomalies")
router.register(r"tanks", TankViewSet, basename="tanks")

urlpatterns = [
    # receipts SMS endpoint
    path("receipts/send-sms/", ReceiptSendSMSAPIView.as_view(), name="receipts-send-sms"),

    # transactions
    path("transactions/", TransactionCreateView.as_view(), name="transactions-create"),
    path("transactions/<uuid:pk>/", TransactionDetailView.as_view(), name="transactions-detail"),

    # receipts list/create + generate/verify
    path("receipts/", ReceiptListCreateAPIView.as_view(), name="receipts-list-create"),
    path("receipts/<str:token>/verify/", ReceiptVerifyView.as_view(), name="receipt-verify"),
    path("receipts/generate/", GenerateReceiptAPIView.as_view(), name="receipt-generate"),
    path("receipts/verify/", VerifyReceiptAPIView.as_view(), name="receipt-verify-post"),

    # reconcile station (explicit)
    path("reconcile/station/<uuid:station_id>/", ReconcileStationAPIView.as_view(), name="reconcile-station"),

    # external event ingestion
    path("events/transaction/", EventIngestView.as_view(), name="events-ingest"),

    # user info / auth helpers
    path("me/", MeAPIView.as_view(), name="me"),
    path("logout/", LogoutAPIView.as_view(), name="logout"),

    # tank readings (nested style)
    path("tanks/<uuid:pk>/readings/", TankReadingsList.as_view(), name="tank-readings"),

    # include router-generated routes (stations, pumps, rules, receipts, anomalies, tanks etc)
    path("", include(router.urls)),
]

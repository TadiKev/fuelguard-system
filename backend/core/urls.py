from django.urls import path
from .views import TransactionCreateView, ReceiptVerifyView

urlpatterns = [
    path('transactions/', TransactionCreateView.as_view(), name='transactions-create'),
    path('receipts/<str:token>/verify/', ReceiptVerifyView.as_view(), name='receipt-verify'),
]

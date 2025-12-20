from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .serializers import TransactionCreateSerializer, TransactionSerializer, ReceiptVerifySerializer
from .models import Transaction, Receipt
from django.shortcuts import get_object_or_404

class TransactionCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TransactionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tx = serializer.save()
        return Response({"transaction_id": str(tx.id), "receipt_token": tx.receipt.receipt_token}, status=status.HTTP_201_CREATED)

class ReceiptVerifyView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        serializer = ReceiptVerifySerializer(data={'token': token})
        serializer.is_valid(raise_exception=True)
        token_data = serializer.validated_data['token']
        tx_id = token_data.get('transaction_id')
        tx = get_object_or_404(Transaction, id=tx_id)
        tx_ser = TransactionSerializer(tx)
        return Response({"valid": True, "transaction": tx_ser.data})

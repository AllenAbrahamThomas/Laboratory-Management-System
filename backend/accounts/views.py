from rest_framework import status, viewsets
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Sum
from django.utils.dateparse import parse_date
import datetime

from .models import AccountHead, CashTransaction, JournalEntry, LoginSession, LabUser
from .serializers import AccountHeadSerializer, CashTransactionSerializer, JournalEntrySerializer, LoginSessionSerializer, LabUserSerializer
from .authentication import SessionTokenAuthentication
from .permissions import HasRequiredPermission, check_permission
from lab.models import Visit


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = LoginSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = serializer.save()
        return Response(LoginSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class UserRoleLookupView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        username = request.query_params.get("username", "").strip()
        if not username:
            return Response({"role": ""})
        try:
            user = LabUser.objects.get(username__iexact=username, is_active=True)
            return Response({"role": user.role})
        except LabUser.DoesNotExist:
            return Response({"role": ""})



@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("user-management")
def recent_logins(request):
    sessions = LoginSession.objects.all()[:20]
    return Response(LoginSessionSerializer(sessions, many=True).data)


class LabUserViewSet(viewsets.ModelViewSet):
    serializer_class = LabUserSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, HasRequiredPermission]
    required_permission = "user-management"

    def get_queryset(self):
        user = self.request.user
        if user.role == LabUser.Role.ADMIN:
            return LabUser.objects.all()
        elif user.role == LabUser.Role.SUPERVISOR:
            # Supervisor can only manage staff
            return LabUser.objects.filter(role=LabUser.Role.STAFF)
        return LabUser.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        role = serializer.validated_data.get("role", LabUser.Role.STAFF)
        
        # Enforce role hierarchy: supervisor can only create staff
        if user.role == LabUser.Role.SUPERVISOR and role != LabUser.Role.STAFF:
            raise PermissionDenied("Supervisors can only create Staff users.")
        
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        role = serializer.validated_data.get("role", serializer.instance.role)
        
        # Enforce role hierarchy
        if user.role == LabUser.Role.SUPERVISOR:
            if serializer.instance.role != LabUser.Role.STAFF:
                raise PermissionDenied("Supervisors can only modify Staff users.")
            if role != LabUser.Role.STAFF:
                raise PermissionDenied("Supervisors cannot promote a user to Supervisor or Admin.")
        
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        
        # Enforce role hierarchy
        if user.role == LabUser.Role.SUPERVISOR and instance.role != LabUser.Role.STAFF:
            raise PermissionDenied("Supervisors can only delete Staff users.")
        
        instance.delete()


class AccountHeadViewSet(viewsets.ModelViewSet):
    queryset = AccountHead.objects.all()
    serializer_class = AccountHeadSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, HasRequiredPermission]
    required_permission = "accounts-heads"


class CashTransactionViewSet(viewsets.ModelViewSet):
    queryset = CashTransaction.objects.all()
    serializer_class = CashTransactionSerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, HasRequiredPermission]

    def get_required_permission(self):
        # Determine permission based on request method and transaction type
        if self.action == "create":
            tx_type = self.request.data.get("tx_type")
            if tx_type == "payment":
                return "cash-payments"
            elif tx_type == "receipt":
                return "cash-receipts"
        return "cash-payments"  # Default fallback

    def check_permissions(self, request):
        self.required_permission = self.get_required_permission()
        super().check_permissions(request)

    def get_queryset(self):
        # Check permissions depending on transaction type filters
        user = request_user = self.request.user
        tx_type = self.request.query_params.get('tx_type')
        
        # Enforce granular permissions
        if tx_type == 'payment' and 'cash-payments' not in user.permissions and user.role != LabUser.Role.ADMIN:
            raise PermissionDenied("No permission to view cash payments.")
        if tx_type == 'receipt' and 'cash-receipts' not in user.permissions and user.role != LabUser.Role.ADMIN:
            raise PermissionDenied("No permission to view cash receipts.")

        queryset = super().get_queryset()
        if tx_type:
            queryset = queryset.filter(tx_type=tx_type)
        return queryset


class JournalEntryViewSet(viewsets.ModelViewSet):
    queryset = JournalEntry.objects.all()
    serializer_class = JournalEntrySerializer
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [IsAuthenticated, HasRequiredPermission]
    required_permission = "journal"


@api_view(["GET"])
@authentication_classes([SessionTokenAuthentication])
@permission_classes([IsAuthenticated])
@check_permission("day-book")
def daybook_view(request):
    date_str = request.query_params.get("date")
    if not date_str:
        date_str = datetime.date.today().isoformat()

    target_date = parse_date(date_str)
    if not target_date:
        return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    # 1. Calculate opening balance (cumulative cash receipts/collections minus payments prior to target_date)
    cash_coll_before = Visit.objects.filter(visit_date__lt=target_date, pay_mode='cash').aggregate(total=Sum('received_amount'))['total'] or 0
    receipts_before = CashTransaction.objects.filter(transaction_date__lt=target_date, tx_type='receipt').aggregate(total=Sum('amount'))['total'] or 0
    payments_before = CashTransaction.objects.filter(transaction_date__lt=target_date, tx_type='payment').aggregate(total=Sum('amount'))['total'] or 0

    opening_balance = float(cash_coll_before + receipts_before - payments_before)

    # 2. Get transactions on date
    visits_on_date = Visit.objects.filter(visit_date=target_date)

    receipt_items = []
    
    # Daily cash invoice collections
    cash_visits_sum = visits_on_date.filter(pay_mode='cash').aggregate(total=Sum('received_amount'))['total'] or 0
    if cash_visits_sum > 0:
        receipt_items.append({
            "label": "Daily Invoice Cash Collection",
            "amount": float(cash_visits_sum),
            "source": "invoice_collection",
            "reference": "Cash Sales"
        })

    # Daily card invoice collections (memo item)
    card_visits_sum = visits_on_date.filter(pay_mode='card').aggregate(total=Sum('received_amount'))['total'] or 0
    if card_visits_sum > 0:
        receipt_items.append({
            "label": "Invoice Card Collection",
            "amount": float(card_visits_sum),
            "source": "card_collection",
            "reference": "Card Sales"
        })

    # Daily UPI invoice collections (memo item)
    upi_visits_sum = visits_on_date.filter(pay_mode='upi').aggregate(total=Sum('received_amount'))['total'] or 0
    if upi_visits_sum > 0:
        receipt_items.append({
            "label": "Invoice UPI Collection",
            "amount": float(upi_visits_sum),
            "source": "upi_collection",
            "reference": "UPI Sales"
        })

    # Daily Cash Receipts Vouchers
    cash_receipts = CashTransaction.objects.filter(transaction_date=target_date, tx_type='receipt')
    for tx in cash_receipts:
        receipt_items.append({
            "label": f"{tx.account_head.name} - {tx.narration if tx.narration else 'Cash Receipt'}",
            "amount": float(tx.amount),
            "source": "voucher",
            "reference": tx.voucher_no
        })

    # Daily Cash Payments Vouchers
    payment_items = []
    cash_payments = CashTransaction.objects.filter(transaction_date=target_date, tx_type='payment')
    for tx in cash_payments:
        payment_items.append({
            "label": f"{tx.account_head.name} - {tx.narration if tx.narration else 'Cash Payment'}",
            "amount": float(tx.amount),
            "source": "voucher",
            "reference": tx.voucher_no
        })

    # Calculate cash-only inflows & outflows for physical cash balance
    daily_cash_inflow = float(cash_visits_sum + sum(tx.amount for tx in cash_receipts))
    daily_cash_outflow = float(sum(tx.amount for tx in cash_payments))
    closing_balance = opening_balance + daily_cash_inflow - daily_cash_outflow

    return Response({
        "date": date_str,
        "opening_balance": opening_balance,
        "receipts": receipt_items,
        "payments": payment_items,
        "closing_balance": closing_balance,
        "total_cash_receipts": daily_cash_inflow,
        "total_cash_payments": daily_cash_outflow
    })

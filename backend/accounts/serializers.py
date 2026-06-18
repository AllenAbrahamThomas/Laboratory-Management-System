from rest_framework import serializers

from .models import AccountHead, CashTransaction, JournalEntry, JournalLine, LoginSession, LabUser


class LoginSessionSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    token = serializers.CharField(read_only=True)
    permissions = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = LoginSession
        fields = ["id", "username", "user_group", "password", "token", "permissions", "login_at"]
        read_only_fields = ["id", "user_group", "token", "permissions", "login_at"]

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("User name is required.")
        return value

    def validate(self, attrs):
        username = attrs.get("username", "").strip()
        password = attrs.get("password", "")

        from django.contrib.auth.hashers import check_password

        user = LabUser.objects.filter(username=username, is_active=True).first()
        if not user or not check_password(password, user.password):
            raise serializers.ValidationError("Invalid username or password.")
        
        self.validated_user = user
        return attrs

    def create(self, validated_data):
        validated_data.pop("password", None)
        validated_data.pop("username", None)
        user = self.validated_user
        
        if user.role == LabUser.Role.ADMIN:
            all_permissions = [
                'invoice-entry', 'edit-invoice', 'patient-advance-search', 
                'pending-collection',
                'result-entry', 'accounts-heads', 'cash-payments', 
                'cash-receipts', 'day-book', 'journal', 'reagent-items', 
                'stock-inward', 'stock-outward', 'stock-report', 
                'daily-collection-statement', 'collection-summary', 
                'daily-collection-summary-division-wise', 'monthly-collection-summary-division-wise', 
                'general-reports', 'accounts-statements', 'master-settings', 'user-management',
                'bill-cancellation'
            ]
            permissions_list = all_permissions
        else:
            permissions_list = user.permissions

        session = LoginSession.objects.create(
            username=user.username,
            user_group=user.role,
            **validated_data
        )
        session.permissions = permissions_list
        return session

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not hasattr(instance, 'permissions'):
            user = LabUser.objects.filter(username=instance.username).first()
            if user:
                if user.role == LabUser.Role.ADMIN:
                    ret['permissions'] = [
                        'invoice-entry', 'edit-invoice', 'patient-advance-search', 
                        'pending-collection',
                        'result-entry', 'accounts-heads', 'cash-payments', 
                        'cash-receipts', 'day-book', 'journal', 'reagent-items', 
                        'stock-inward', 'stock-outward', 'stock-report', 
                        'daily-collection-statement', 'collection-summary', 
                        'daily-collection-summary-division-wise', 'monthly-collection-summary-division-wise', 
                        'general-reports', 'accounts-statements', 'master-settings', 'user-management',
                        'bill-cancellation'
                    ]
                else:
                    ret['permissions'] = user.permissions
            else:
                ret['permissions'] = []
        else:
            ret['permissions'] = instance.permissions
        return ret


class LabUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = LabUser
        fields = ["id", "username", "password", "role", "permissions", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        password = validated_data.pop("password", "")
        if not password:
            raise serializers.ValidationError({"password": "Password is required for new users."})
        
        from django.contrib.auth.hashers import make_password
        validated_data["password"] = make_password(password)
        
        if "permissions" not in validated_data or not validated_data["permissions"]:
            role = validated_data.get("role", LabUser.Role.STAFF)
            if role == LabUser.Role.STAFF:
                validated_data["permissions"] = [
                    'invoice-entry', 'edit-invoice', 'patient-advance-search', 
                    'pending-collection', 'result-entry'
                ]
            elif role == LabUser.Role.SUPERVISOR:
                validated_data["permissions"] = [
                    'invoice-entry', 'edit-invoice', 'patient-advance-search', 
                    'pending-collection', 'result-entry', 'user-management',
                    'bill-cancellation'
                ]
        
        return super().create(validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        if password:
            from django.contrib.auth.hashers import make_password
            instance.password = make_password(password)
        
        return super().update(instance, validated_data)



class AccountHeadSerializer(serializers.ModelSerializer):
    group_display = serializers.CharField(source='get_group_display', read_only=True)

    class Meta:
        model = AccountHead
        fields = ["id", "name", "group", "group_display", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class CashTransactionSerializer(serializers.ModelSerializer):
    account_head_name = serializers.CharField(source='account_head.name', read_only=True)
    account_head_group = serializers.CharField(source='account_head.group', read_only=True)

    class Meta:
        model = CashTransaction
        fields = [
            "id",
            "voucher_no",
            "transaction_date",
            "account_head",
            "account_head_name",
            "account_head_group",
            "amount",
            "narration",
            "tx_type",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class JournalLineSerializer(serializers.ModelSerializer):
    account_head_name = serializers.CharField(source='account_head.name', read_only=True)

    class Meta:
        model = JournalLine
        fields = ["id", "account_head", "account_head_name", "debit", "credit"]
        read_only_fields = ["id"]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True)

    class Meta:
        model = JournalEntry
        fields = ["id", "entry_date", "narration", "lines", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        lines = attrs.get('lines', [])
        if not lines:
            raise serializers.ValidationError("At least one journal line is required.")
        total_debit = sum(line.get('debit', 0) for line in lines)
        total_credit = sum(line.get('credit', 0) for line in lines)
        if total_debit != total_credit:
            raise serializers.ValidationError("Total debits must equal total credits in a journal entry.")
        return attrs

    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        entry = JournalEntry.objects.create(**validated_data)
        for line_data in lines_data:
            JournalLine.objects.create(entry=entry, **line_data)
        return entry

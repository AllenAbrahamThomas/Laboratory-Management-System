from rest_framework import serializers

from .models import AccountHead, CashTransaction, JournalEntry, JournalLine, LoginSession


class LoginSessionSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = LoginSession
        fields = ["id", "username", "user_group", "password", "login_at"]
        read_only_fields = ["id", "login_at"]

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("User name is required.")
        return value

    def validate(self, attrs):
        username = attrs.get("username", "").strip()
        password = attrs.get("password", "")

        if username != "admin" or password != "admin":
            raise serializers.ValidationError("Invalid username or password.")
        return attrs

    def create(self, validated_data):
        validated_data.pop("password", None)
        return LoginSession.objects.create(**validated_data)


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

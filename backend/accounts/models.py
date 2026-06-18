from django.db import models
import secrets


def generate_token():
    return secrets.token_hex(32)


class LoginSession(models.Model):
    username = models.CharField(max_length=120)
    user_group = models.CharField(max_length=120, blank=True)
    token = models.CharField(max_length=64, unique=True, default=generate_token)
    login_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-login_at"]

    def __str__(self):
        return f"{self.username} at {self.login_at:%Y-%m-%d %H:%M:%S}"


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class LabUser(TimestampedModel):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        SUPERVISOR = 'supervisor', 'Supervisor'
        STAFF = 'staff', 'Staff'

    username = models.CharField(max_length=150, unique=True)
    password = models.CharField(max_length=128)  # hashed password
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)
    permissions = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "lab_users"
        ordering = ["role", "username"]

    def __str__(self) -> str:
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False



class AccountHead(TimestampedModel):
    class Group(models.TextChoices):
        ASSET = 'asset', 'Asset'
        LIABILITY = 'liability', 'Liability'
        EQUITY = 'equity', 'Equity'
        REVENUE = 'revenue', 'Revenue'
        EXPENSE = 'expense', 'Expense'

    name = models.CharField(max_length=150, unique=True)
    group = models.CharField(max_length=20, choices=Group.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "account_heads"
        ordering = ["group", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_group_display()})"


class CashTransaction(TimestampedModel):
    class TxType(models.TextChoices):
        PAYMENT = 'payment', 'Payment'
        RECEIPT = 'receipt', 'Receipt'

    voucher_no = models.CharField(max_length=50, unique=True)
    transaction_date = models.DateField()
    account_head = models.ForeignKey(AccountHead, on_delete=models.PROTECT, related_name="cash_transactions")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    narration = models.TextField(blank=True)
    tx_type = models.CharField(max_length=10, choices=TxType.choices)

    class Meta:
        db_table = "cash_transactions"
        ordering = ["-transaction_date", "-id"]

    def __str__(self) -> str:
        return f"{self.voucher_no} - {self.tx_type} - {self.amount}"


class JournalEntry(TimestampedModel):
    entry_date = models.DateField()
    narration = models.TextField(blank=True)

    class Meta:
        db_table = "journal_entries"
        ordering = ["-entry_date", "-id"]

    def __str__(self) -> str:
        return f"Journal on {self.entry_date} - {self.id}"


class JournalLine(models.Model):
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account_head = models.ForeignKey(AccountHead, on_delete=models.PROTECT, related_name="journal_lines")
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = "journal_lines"

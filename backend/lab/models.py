# pyrefly: ignore [missing-import]
from django.db import models


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Department(TimestampedModel):
    department_code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=120, unique=True)
    report_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "departments"
        ordering = ["report_order", "name"]

    def __str__(self) -> str:
        return self.name


class Doctor(TimestampedModel):
    doctor_code = models.CharField(max_length=30, unique=True, null=True, blank=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "doctors"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Hospital(TimestampedModel):
    hospital_code = models.CharField(max_length=30, unique=True, null=True, blank=True)
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "hospitals"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Patient(TimestampedModel):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    patient_code = models.CharField(max_length=30, unique=True, null=True, blank=True)
    full_name = models.CharField(max_length=150)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    age_years = models.PositiveIntegerField(default=0)
    age_months = models.PositiveIntegerField(default=0)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)

    class Meta:
        db_table = "patients"
        ordering = ["full_name", "id"]
        indexes = [
            models.Index(fields=["full_name"]),
            models.Index(fields=["phone"]),
        ]

    def __str__(self) -> str:
        return self.full_name


class Unit(TimestampedModel):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "units"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


def _next_test_code() -> str:
    import re
    max_numeric = 0
    pattern = re.compile(r'^TC-(\d+)$', re.IGNORECASE)
    for code in Test.objects.values_list("test_code", flat=True):
        match = pattern.match(str(code).strip())
        if match:
            num = int(match.group(1))
            if num > max_numeric:
                max_numeric = num

    candidate = max_numeric + 1
    candidate_code = f"TC-{str(candidate).zfill(4)}"
    while Test.objects.filter(test_code__iexact=candidate_code).exists():
        candidate += 1
        candidate_code = f"TC-{str(candidate).zfill(4)}"

    return candidate_code


class Test(TimestampedModel):
    class ResultType(models.TextChoices):
        NUMERIC = "numeric", "Numeric"
        TEXT = "text", "Text"
        CHOICE = "choice", "Choice"
        PANEL = "panel", "Panel"

    test_code = models.CharField(max_length=30, unique=True)
    test_name = models.CharField(max_length=180)
    short_name = models.CharField(max_length=80, blank=True)
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="tests")
    rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    default_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    default_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit = models.CharField(max_length=50, blank=True)
    result_type = models.CharField(
        max_length=20,
        choices=ResultType.choices,
        default=ResultType.NUMERIC,
    )
    is_group = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    reagent_item = models.ForeignKey(
        "ReagentItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tests",
    )
    reagent_quantity = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    reagent_auto_reduce = models.BooleanField(default=False)
    technology = models.ForeignKey(
        "Technology",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tests",
    )

    class Meta:
        db_table = "tests"
        ordering = ["department__report_order", "test_name"]
        indexes = [
            models.Index(fields=["test_name"]),
        ]

    def __str__(self) -> str:
        return self.test_name

    def save(self, *args, **kwargs):
        if not self.test_code:
            self.test_code = _next_test_code()
        elif self.pk:
            orig = Test.objects.get(pk=self.pk)
            if orig.test_code != self.test_code:
                self.test_code = orig.test_code
        super().save(*args, **kwargs)
        if self.unit:
            unit_name = self.unit.strip()
            if unit_name:
                Unit.objects.get_or_create(name=unit_name, defaults={"is_active": True})


class TestComponent(TimestampedModel):
    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="components")
    component_name = models.CharField(max_length=255)
    result_type = models.CharField(
        max_length=20,
        choices=Test.ResultType.choices,
        default=Test.ResultType.NUMERIC,
    )
    unit = models.CharField(max_length=50, blank=True)
    display_order = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "test_components"
        ordering = ["test", "display_order", "id"]

    def __str__(self) -> str:
        return f"{self.test.test_name} - {self.component_name}"


class TestGroupItem(models.Model):
    parent_test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="group_items")
    child_test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="parent_groups")
    line_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "test_group_items"
        ordering = ["line_order", "id"]
        unique_together = [("parent_test", "child_test")]

    def __str__(self) -> str:
        return f"{self.parent_test} -> {self.child_test}"


class Visit(TimestampedModel):
    class PayMode(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        UPI = "upi", "UPI"
        CREDIT = "credit", "Credit"

    class DiscountMode(models.TextChoices):
        NORMAL = "normal", "Normal"
        CORPORATE = "corporate", "Corporate"
        STAFF = "staff", "Staff"

    class Status(models.TextChoices):
        REGISTERED = "registered", "Registered"
        RESULT_ENTERED = "result_entered", "Result Entered"
        AUTHORIZED = "authorized", "Authorized"
        CANCELLED = "cancelled", "Cancelled"

    lab_no = models.CharField(max_length=30, unique=True)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="visits")
    visit_date = models.DateField()
    sample_on = models.DateTimeField()
    ip_no = models.CharField(max_length=40, blank=True)
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.PROTECT,
        related_name="visits",
        null=True,
        blank=True,
    )
    out_doctor_name = models.CharField(max_length=150, blank=True)
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.PROTECT,
        related_name="visits",
        null=True,
        blank=True,
    )
    corporate_name = models.CharField(max_length=150, blank=True)
    pay_mode = models.CharField(max_length=20, choices=PayMode.choices, default=PayMode.CASH)
    discount_mode = models.CharField(
        max_length=20,
        choices=DiscountMode.choices,
        default=DiscountMode.NORMAL,
    )
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_reason = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)
    round_off = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    received_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REGISTERED)
    cancel_reason = models.TextField(blank=True)
    cancelled_by = models.ForeignKey(
        "accounts.LabUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_visits",
    )


    class Meta:
        db_table = "visits"
        ordering = ["-visit_date", "-id"]
        indexes = [
            models.Index(fields=["lab_no"]),
            models.Index(fields=["visit_date"]),
        ]

    def __str__(self) -> str:
        return self.lab_no


class VisitTest(models.Model):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name="visit_tests")
    test = models.ForeignKey(Test, on_delete=models.PROTECT, related_name="visit_tests")
    test_name_snapshot = models.CharField(max_length=180)
    rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    line_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "visit_tests"
        ordering = ["line_order", "id"]

    def __str__(self) -> str:
        return f"{self.visit.lab_no} - {self.test_name_snapshot}"


class TestReferenceRange(TimestampedModel):
    class ReferenceGroup(models.TextChoices):
        COMMON = "COMMON", "Common"
        MALE = "MALE", "Male"
        FEMALE = "FEMALE", "Female"
        CHILD = "CHILD", "Child"

    class Operator(models.TextChoices):
        BETWEEN = "between", "Between"
        LT = "lt", "Less Than"
        LTE = "lte", "Less Than or Equal"
        GT = "gt", "Greater Than"
        GTE = "gte", "Greater Than or Equal"
        TEXT = "text", "Text Only"

    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="reference_ranges", null=True, blank=True)
    component = models.ForeignKey(TestComponent, on_delete=models.CASCADE, related_name="reference_ranges", null=True, blank=True)
    reference_group = models.CharField(max_length=20, choices=ReferenceGroup.choices, default=ReferenceGroup.COMMON)
    operator = models.CharField(max_length=20, choices=Operator.choices, default=Operator.BETWEEN)
    min_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    display_text = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "test_reference_ranges"
        ordering = ["component", "reference_group", "id"]

    def __str__(self) -> str:
        if self.component:
            return f"{self.component.component_name} ({self.reference_group})"
        return f"Legacy Test Range ({self.reference_group})"

    def get_gender_display(self) -> str:
        return self.get_reference_group_display()

    def save(self, *args, **kwargs):
        if self.component and not self.test:
            self.test = self.component.test
        super().save(*args, **kwargs)



class TestResult(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ENTERED = "entered", "Entered"
        AUTHORIZED = "authorized", "Authorized"

    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name="results")
    visit_test = models.ForeignKey(VisitTest, on_delete=models.CASCADE, related_name="results")
    test = models.ForeignKey(Test, on_delete=models.PROTECT, related_name="results", null=True, blank=True)
    component = models.ForeignKey(TestComponent, on_delete=models.PROTECT, related_name="results", null=True, blank=True)
    result_value = models.CharField(max_length=120, blank=True)
    result_value_numeric = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    result_text = models.TextField(blank=True)
    unit = models.CharField(max_length=50, blank=True)
    reference_range_text = models.CharField(max_length=255, blank=True)
    remarks = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    entered_at = models.DateTimeField(null=True, blank=True)
    authorized_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "test_results"
        ordering = ["visit", "visit_test__line_order", "id"]
        indexes = [
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"{self.visit.lab_no} - {self.test.test_name}"


class ReagentItem(TimestampedModel):
    class ReagentType(models.TextChoices):
        LIQUID = 'liquid', 'Liquid Reagent'
        CARD = 'card', 'Card / Rapid Test'
        OTHER = 'other', 'Other General Item'

    name = models.CharField(max_length=150, unique=True)
    item_code = models.CharField(max_length=30, unique=True, null=True, blank=True)
    reagent_type = models.CharField(max_length=20, choices=ReagentType.choices, default=ReagentType.OTHER)
    bottle_size = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Bottle size in ml, e.g. 500")
    unit_of_measure = models.CharField(max_length=50, help_text="e.g. ml, Box, Packet, Vial")
    min_stock_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    quantity_in_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    quantity_in_use = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = "reagent_items"
        ordering = ["name"]

    @property
    def active_open_bottles(self):
        if self.reagent_type != 'liquid':
            return []
        
        open_bottles = []
        batches = self.transactions.values_list('batch_no', flat=True).order_by().distinct()
        for batch in batches:
            latest_tx = self.transactions.filter(
                batch_no=batch,
                tx_type__in=['outward', 'open_bottle', 'discard_in_use']
            ).order_by('-received_date', '-id').first()
            
            if latest_tx and latest_tx.tx_type in ['outward', 'open_bottle']:
                inward_tx = self.transactions.filter(
                    batch_no=batch,
                    tx_type='inward'
                ).order_by('-received_date', '-id').first()
                expiry = inward_tx.expiry_date.isoformat() if (inward_tx and inward_tx.expiry_date) else None
                open_bottles.append({
                    "batch_no": batch,
                    "expiry_date": expiry
                })
        return open_bottles

    def __str__(self) -> str:
        return f"{self.name} ({self.quantity_in_stock} {self.unit_of_measure})"


class StockTransaction(TimestampedModel):
    class TxType(models.TextChoices):
        INWARD = 'inward', 'Inward (Receipt)'
        OUTWARD = 'outward', 'Outward (Consumption)'
        OPEN_BOTTLE = 'open_bottle', 'Open Bottle'
        DISCARD_IN_USE = 'discard_in_use', 'Discard Empty Bottle'

    reagent_item = models.ForeignKey(ReagentItem, on_delete=models.PROTECT, related_name="transactions")
    tx_type = models.CharField(max_length=15, choices=TxType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    bottle_size = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    batch_no = models.CharField(max_length=50, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    received_date = models.DateField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    supplier_name = models.CharField(max_length=150, blank=True)
    invoice_no = models.CharField(max_length=50, blank=True)
    narration = models.TextField(blank=True)
    test_result = models.ForeignKey(TestResult, on_delete=models.CASCADE, null=True, blank=True, related_name="stock_transactions")

    class Meta:
        db_table = "stock_transactions"
        ordering = ["-received_date", "-id"]

    def __str__(self) -> str:
        return f"{self.tx_type} - {self.reagent_item.name} - {self.quantity}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        stock_qty, in_use_qty = self.calculate_current_stock()
        self.reagent_item.quantity_in_stock = stock_qty
        self.reagent_item.quantity_in_use = in_use_qty
        self.reagent_item.save()

    def delete(self, *args, **kwargs):
        item = self.reagent_item
        super().delete(*args, **kwargs)
        stock_qty, in_use_qty = self.calculate_current_stock_for_item(item)
        item.quantity_in_stock = stock_qty
        item.quantity_in_use = in_use_qty
        item.save()

    def calculate_current_stock(self):
        return self.calculate_current_stock_for_item(self.reagent_item)

    @staticmethod
    def calculate_current_stock_for_item(item):
        inward_sum = StockTransaction.objects.filter(reagent_item=item, tx_type='inward').aggregate(total=models.Sum('quantity'))['total'] or 0
        outward_sum = StockTransaction.objects.filter(reagent_item=item, tx_type='outward').aggregate(total=models.Sum('quantity'))['total'] or 0
        
        quantity_in_stock = inward_sum - outward_sum
        
        if item.reagent_type == 'liquid':
            quantity_in_use = 0
            batches = StockTransaction.objects.filter(reagent_item=item).values_list('batch_no', flat=True).order_by().distinct()
            for batch in batches:
                latest_tx = StockTransaction.objects.filter(
                    reagent_item=item,
                    batch_no=batch,
                    tx_type__in=['outward', 'open_bottle', 'discard_in_use']
                ).order_by('-received_date', '-id').first()
                if latest_tx and latest_tx.tx_type in ['outward', 'open_bottle']:
                    quantity_in_use += 1
        else:
            quantity_in_use = 0
            
        return quantity_in_stock, quantity_in_use


class Method(TimestampedModel):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "methods"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Technology(TimestampedModel):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "technologies"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class DiscountReason(TimestampedModel):
    reason_text = models.CharField(max_length=255, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "discount_reasons"
        ordering = ["reason_text"]

    def __str__(self) -> str:
        return self.reason_text


class SMSTemplate(TimestampedModel):
    class EventType(models.TextChoices):
        REGISTRATION = "registration", "On Patient Registration"
        RESULT_READY = "result_ready", "On Result Ready"
        BALANCE_DUE = "balance_due", "On Balance Due"

    event_name = models.CharField(max_length=50, unique=True, choices=EventType.choices)
    template_text = models.TextField()

    class Meta:
        db_table = "sms_templates"
        ordering = ["event_name"]

    def __str__(self) -> str:
        return self.get_event_name_display()


class LabCustomization(TimestampedModel):
    section = models.CharField(max_length=50)  # e.g., 'customize_1', 'customize_2', 'customize_3'
    key = models.CharField(max_length=50, unique=True)
    value = models.TextField(blank=True)

    class Meta:
        db_table = "lab_customizations"
        ordering = ["section", "key"]

    def __str__(self) -> str:
        return f"{self.section} - {self.key}"


from django.db.models.signals import post_delete
from django.dispatch import receiver
import re

@receiver(post_delete, sender=Test)
def shift_test_codes_on_delete(sender, instance, **kwargs):
    code = instance.test_code
    match = re.match(r'^TC-(\d+)$', code, re.IGNORECASE)
    if not match:
        return
        
    deleted_num = int(match.group(1))
    
    tests_to_update = []
    pattern = re.compile(r'^TC-(\d+)$', re.IGNORECASE)
    for t in Test.objects.filter(test_code__istartswith='TC-'):
        m = pattern.match(t.test_code)
        if m:
            num = int(m.group(1))
            if num > deleted_num:
                tests_to_update.append((t.pk, num))
                
    if not tests_to_update:
        return
        
    # Sort in ascending order to process sequentially
    tests_to_update.sort(key=lambda x: x[1])
    
    from django.db import transaction
    with transaction.atomic():
        # Step 1: Update to temp to avoid unique constraint violations
        for pk, num in tests_to_update:
            new_num = num - 1
            Test.objects.filter(pk=pk).update(test_code=f"TEMP-{new_num:04d}")
            
        # Step 2: Update to final TC-XXXX
        for pk, num in tests_to_update:
            new_num = num - 1
            Test.objects.filter(pk=pk).update(test_code=f"TC-{new_num:04d}")



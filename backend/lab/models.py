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
    unit = models.CharField(max_length=50, blank=True)
    result_type = models.CharField(
        max_length=20,
        choices=ResultType.choices,
        default=ResultType.NUMERIC,
    )
    is_group = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "tests"
        ordering = ["department__report_order", "test_name"]
        indexes = [
            models.Index(fields=["test_name"]),
        ]

    def __str__(self) -> str:
        return self.test_name


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
    class Gender(models.TextChoices):
        ANY = "any", "Any"
        MALE = "male", "Male"
        FEMALE = "female", "Female"

    class Operator(models.TextChoices):
        BETWEEN = "between", "Between"
        LT = "lt", "Less Than"
        LTE = "lte", "Less Than or Equal"
        GT = "gt", "Greater Than"
        GTE = "gte", "Greater Than or Equal"
        TEXT = "text", "Text Only"

    test = models.ForeignKey(Test, on_delete=models.CASCADE, related_name="reference_ranges")
    gender = models.CharField(max_length=10, choices=Gender.choices, default=Gender.ANY)
    age_years_min = models.PositiveIntegerField(null=True, blank=True)
    age_years_max = models.PositiveIntegerField(null=True, blank=True)
    age_months_min = models.PositiveIntegerField(null=True, blank=True)
    age_months_max = models.PositiveIntegerField(null=True, blank=True)
    operator = models.CharField(max_length=20, choices=Operator.choices, default=Operator.BETWEEN)
    min_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    display_text = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "test_reference_ranges"
        ordering = ["test", "gender", "age_years_min", "age_months_min", "id"]

    def __str__(self) -> str:
        return f"{self.test.test_name} ({self.gender})"


class TestResult(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ENTERED = "entered", "Entered"
        AUTHORIZED = "authorized", "Authorized"

    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name="results")
    visit_test = models.ForeignKey(VisitTest, on_delete=models.CASCADE, related_name="results")
    test = models.ForeignKey(Test, on_delete=models.PROTECT, related_name="results")
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


import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, DestroyRef, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ClockService } from '../../../services/clock.service';
import { TestLookupItem, VisitDetail, VisitService } from '../../../services/visit.service';

interface TestLine {
  slNo: number;
  testCode: string;
  testName: string;
  rate: number | null;
  discount: number | null;
  amount: number | null;
}

@Component({
  selector: 'app-bill-registration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bill-registration.component.html',
  styleUrl: './bill-registration.component.css'
})
export class BillRegistrationComponent implements OnChanges, AfterViewInit {
  @ViewChild('billFormElement') billFormElement?: ElementRef<HTMLFormElement>;
  @ViewChild('testTableElement') testTableElement?: ElementRef<HTMLTableElement>;
  @Input() selectedVisitId: number | null = null;
  @Input() openMode: 'new' | 'existing' | 'prefill-only' = 'new';
  @Output() closed = new EventEmitter<void>();
  @Output() advanceSearch = new EventEmitter<void>();
  @Output() resultEntry = new EventEmitter<number>();

  private readonly clockService = inject(ClockService);
  private readonly visitService = inject(VisitService);
  private readonly destroyRef = inject(DestroyRef);

  readonly paymentModes = ['Cash', 'Card', 'UPI', 'Credit'];
  readonly discountModes = ['NORMAL', 'CORPORATE', 'STAFF'];
  readonly salutations = ['Mr.', 'Mrs.', 'Miss.', 'Paster', 'Master.', 'Fr.', 'Mother.', 'Baby.', 'Sist.', 'Dr.', 'Justice'];
  readonly today = this.getTodayDate();

  currentTime = new Date();
  labNo = '00001';
  payMode = 'Cash';
  salutation = 'Mr';
  patientName = '';
  gender = 'Male';
  age = '';
  ageType = 'Years';
  month = '';
  phone = '';
  address = '';
  sampleOn = this.getSampleTime();
  ipNo = '';
  doctor = '';
  outDoctor = '';
  hospital = '';
  corporate = '';
  discountMode = 'NORMAL';
  discountPercent = '';
  receivedAmount = '';
  balanceAmount = '';
  grossAmount = 0;
  note = '';
  roundOff = '';
  discountReason = '';
  selectedTestSlNo: number | null = null;
  isLoadingVisit = false;
  isSaving = false;
  saveMessage = '';
  loadError = '';
  showEditInvoiceDialog = false;
  editLabNo = '';
  editLookupError = '';
  isLookingUpLabNo = false;
  testSuggestions: TestLookupItem[] = [];
  activeSuggestionSlNo: number | null = null;
  isLoadingTestSuggestions = false;
  suggestionWidthPx = 0;
  suggestionGridTemplate = '';
  private testLookupDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private currentVisitId: number | null = null;

  tests: TestLine[] = [
    {
      slNo: 1,
      testCode: '',
      testName: '',
      rate: null,
      discount: null,
      amount: null
    }
  ];

  constructor() {
    this.clockService.currentTime$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((currentTime) => {
        this.currentTime = currentTime;
      });
  }

  ngAfterViewInit(): void {
    this.recalculateSuggestionLayout();
    setTimeout(() => this.recalculateSuggestionLayout(), 0);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.recalculateSuggestionLayout();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const openModeChange = changes['openMode'];
    const selectedVisitIdChange = changes['selectedVisitId'];
    if (openModeChange && this.openMode === 'existing' && this.selectedVisitId === null) {
      this.showEditInvoiceDialog = true;
    }

    if (openModeChange && this.openMode === 'new' && this.selectedVisitId === null) {
      this.resetForNewRegistration();
      return;
    }

    if (!selectedVisitIdChange || this.selectedVisitId === null) {
      return;
    }

    this.loadVisit(this.selectedVisitId, this.openMode);
  }

  addTestLine(): void {
    const nextSlNo = this.tests.length + 1;

    this.tests = [
      ...this.tests,
      {
        slNo: nextSlNo,
        testCode: '',
        testName: '',
        rate: null,
        discount: null,
        amount: null
      }
    ];
  }

  selectTestLine(test: TestLine): void {
    this.selectedTestSlNo = test.slNo;
  }

  deleteSelectedTestLine(): void {
    if (this.selectedTestSlNo === null) {
      return;
    }

    const remainingTests = this.tests.filter((test) => test.slNo !== this.selectedTestSlNo);
    this.tests = remainingTests.map((test, index) => ({
      ...test,
      slNo: index + 1
    }));
    this.selectedTestSlNo = null;
    this.updateGrossAmount();
  }

  updateAmount(test: TestLine): void {
    const rate = Number(test.rate) || 0;
    const discount = Number(test.discount) || 0;
    test.amount = Math.max(rate - (rate * discount / 100), 0);
    this.updateGrossAmount();
  }

  onPatientNameEnter(event: Event): void {
    event.preventDefault();
    this.patientName = this.toUppercase(this.patientName);
  }

  onFormEnter(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (target.tagName === 'TEXTAREA') {
      return;
    }

    event.preventDefault();
    const targetName = (target as HTMLInputElement | HTMLSelectElement).name || '';

    if (targetName === 'patientName') {
      this.patientName = this.toUppercase(this.patientName);
    }

    if (targetName.startsWith('testCode')) {
      const slNo = this.extractSlNo(targetName, 'testCode');
      const line = this.tests.find((item) => item.slNo === slNo);
      if (line && this.activeSuggestionSlNo === slNo && this.testSuggestions.length > 0) {
        this.selectTestSuggestion(line, this.testSuggestions[0]);
        this.focusByName(`testName${slNo}`);
        return;
      }
    }

    if (targetName.startsWith('discount')) {
      const slNo = this.extractSlNo(targetName, 'discount');
      if (slNo) {
        const current = this.tests.find((item) => item.slNo === slNo);
        const next = this.tests.find((item) => item.slNo === slNo + 1);
        const hasCurrentTest = !!current?.testCode.trim() || !!current?.testName.trim() || !!Number(current?.rate);
        if (!next && hasCurrentTest) {
          this.addTestLine();
          setTimeout(() => this.focusByName(`testCode${slNo + 1}`), 0);
          return;
        }
        this.focusByName(`amount${slNo}`);
        return;
      }
    }

    if (targetName.startsWith('amount')) {
      const slNo = this.extractSlNo(targetName, 'amount');
      if (slNo) {
        const current = this.tests.find((item) => item.slNo === slNo);
        const next = this.tests.find((item) => item.slNo === slNo + 1);
        const hasCurrentTest = !!current?.testCode.trim() || !!current?.testName.trim() || !!Number(current?.rate);
        if (!next && hasCurrentTest) {
          this.addTestLine();
          setTimeout(() => this.focusByName(`testCode${slNo + 1}`), 0);
          return;
        }
        if (next) {
          const nextEmpty = !next.testCode.trim() && !next.testName.trim() && !Number(next.rate) && !Number(next.discount);
          if (nextEmpty) {
            this.focusByName('discountMode');
            return;
          }
          this.focusByName(`testCode${slNo + 1}`);
          return;
        }
      }
    }

    this.focusNextControl(target);
  }

  openEditInvoiceLookup(): void {
    this.showEditInvoiceDialog = true;
    this.editLookupError = '';
  }

  closeEditInvoiceLookup(): void {
    this.showEditInvoiceDialog = false;
    this.editLookupError = '';
  }

  searchEditInvoiceByLabNo(): void {
    const labNo = this.editLabNo.trim();
    if (!labNo) {
      this.editLookupError = 'Enter lab number.';
      return;
    }
    this.isLookingUpLabNo = true;
    this.editLookupError = '';
    this.visitService.getVisitByLabNo(labNo).subscribe({
      next: (visit) => {
        this.currentVisitId = visit.id;
        this.applyVisitData(visit);
        this.showEditInvoiceDialog = false;
        this.isLookingUpLabNo = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isLookingUpLabNo = false;
        this.editLookupError = error.status === 404 ? 'Lab number not found.' : 'Unable to load invoice.';
      }
    });
  }

  onTestCodeInput(test: TestLine): void {
    test.testCode = this.toUppercase(test.testCode);
    const query = test.testCode.trim();
    if (!query) {
      this.activeSuggestionSlNo = null;
      this.testSuggestions = [];
      return;
    }

    if (this.testLookupDebounceHandle) {
      clearTimeout(this.testLookupDebounceHandle);
    }
    this.testLookupDebounceHandle = setTimeout(() => {
      this.isLoadingTestSuggestions = true;
      this.visitService.getTests(query).subscribe({
        next: (rows) => {
          this.activeSuggestionSlNo = test.slNo;
          this.testSuggestions = rows;
          this.recalculateSuggestionLayout();
          this.isLoadingTestSuggestions = false;
        },
        error: () => {
          this.activeSuggestionSlNo = null;
          this.testSuggestions = [];
          this.isLoadingTestSuggestions = false;
        }
      });
    }, 150);
  }

  selectTestSuggestion(test: TestLine, selected: TestLookupItem): void {
    test.testCode = selected.short_name || selected.test_code;
    test.testName = selected.test_name;
    test.rate = Number(selected.rate) || 0;
    test.discount = Number(selected.default_discount_percent) || 0;
    const defaultAmount = Number(selected.default_amount) || 0;
    test.amount = defaultAmount > 0 ? defaultAmount : Math.max(Number(test.rate) - (Number(test.rate) * Number(test.discount) / 100), 0);
    this.updateGrossAmount();
    this.activeSuggestionSlNo = null;
    this.testSuggestions = [];
  }

  closeTestSuggestion(): void {
    setTimeout(() => {
      this.activeSuggestionSlNo = null;
      this.testSuggestions = [];
    }, 150);
  }

  onReceivedAmountChange(): void {
    this.updateBalanceAmount();
  }

  onRoundOffChange(): void {
    this.updateBalanceAmount();
  }

  private updateGrossAmount(): void {
    this.grossAmount = this.tests.reduce((total, item) => total + (Number(item.amount) || 0), 0);
    this.updateBalanceAmount();
  }

  private updateBalanceAmount(): void {
    const received = Number(this.receivedAmount) || 0;
    const roundOff = Number(this.roundOff) || 0;
    const netPayable = this.grossAmount + roundOff;
    const balance = Math.max(netPayable - received, 0);
    this.balanceAmount = balance.toFixed(2);
  }

  private loadVisit(visitId: number, mode: 'new' | 'existing' | 'prefill-only'): void {
    this.isLoadingVisit = true;
    this.loadError = '';

    this.visitService.getVisitById(visitId).subscribe({
      next: (visit) => {
        this.currentVisitId = mode === 'prefill-only' ? null : visit.id;
        if (mode === 'prefill-only') {
          this.applyPrefillOnlyData(visit);
        } else {
          this.applyVisitData(visit);
        }
        this.isLoadingVisit = false;
      },
      error: (error: HttpErrorResponse) => {
        this.currentVisitId = null;
        this.isLoadingVisit = false;
        this.loadError = error.status === 0
          ? 'Unable to reach backend.'
          : 'Unable to load patient bill.';
      }
    });
  }

  private applyVisitData(visit: VisitDetail): void {
    this.labNo = visit.lab_no;
    this.payMode = this.toTitleCase(visit.pay_mode);
    const parsedName = this.parsePatientName(visit.patient_name);
    this.salutation = parsedName.salutation;
    this.patientName = parsedName.name;
    this.patientName = this.toUppercase(this.patientName);
    this.gender = visit.gender;
    this.age = String(visit.age_years ?? 0);
    this.ageType = 'Years';
    this.month = String(visit.age_months ?? 0);
    this.phone = visit.phone;
    this.address = visit.address;
    this.sampleOn = this.formatSampleTime(visit.sample_on);
    this.ipNo = visit.ip_no;
    this.doctor = visit.doctor;
    this.outDoctor = visit.out_doctor_name;
    this.hospital = visit.hospital;
    this.corporate = visit.corporate_name;
    this.discountMode = (visit.discount_mode || 'NORMAL').toUpperCase();
    this.discountPercent = String(visit.discount_percent ?? '');
    this.receivedAmount = String(visit.received_amount ?? '');
    this.balanceAmount = String(visit.balance_amount ?? '');
    this.grossAmount = Number(visit.gross_amount) || 0;
    this.note = visit.note;
    this.roundOff = String(visit.round_off ?? '');
    this.discountReason = visit.discount_reason;

    const mappedTests = visit.tests
      .sort((a, b) => a.line_order - b.line_order)
      .map((test, index) => ({
        slNo: index + 1,
        testCode: test.test_code || '',
        testName: test.test_name || '',
        rate: Number(test.rate) || 0,
        discount: Number(test.discount_percent) || 0,
        amount: Number(test.amount) || 0,
      }));

    this.tests = mappedTests.length > 0 ? mappedTests : [{
      slNo: 1,
      testCode: '',
      testName: '',
      rate: null,
      discount: null,
      amount: null
    }];
    this.selectedTestSlNo = null;
    this.updateGrossAmount();
  }

  private applyPrefillOnlyData(visit: VisitDetail): void {
    const parsedName = this.parsePatientName(visit.patient_name);
    this.salutation = parsedName.salutation;
    this.patientName = parsedName.name;
    this.patientName = this.toUppercase(this.patientName);
    this.gender = visit.gender || 'Male';
    this.age = String(visit.age_years ?? 0);
    this.ageType = 'Years';
    this.month = String(visit.age_months ?? 0);
    this.phone = visit.phone;
    this.address = visit.address;
    this.sampleOn = this.getSampleTime();
    this.ipNo = visit.ip_no;
    this.doctor = visit.doctor;
    this.outDoctor = visit.out_doctor_name;
    this.hospital = visit.hospital;
    this.corporate = visit.corporate_name;
    this.note = '';

    this.tests = [{
      slNo: 1,
      testCode: '',
      testName: '',
      rate: null,
      discount: null,
      amount: null
    }];
    this.selectedTestSlNo = null;
    this.discountPercent = '';
    this.receivedAmount = '';
    this.balanceAmount = '';
    this.grossAmount = 0;
    this.roundOff = '';
    this.discountReason = '';
  }

  private resetForNewRegistration(): void {
    this.currentVisitId = null;
    this.salutation = 'Mr';
    this.patientName = '';
    this.gender = 'Male';
    this.age = '';
    this.ageType = 'Years';
    this.month = '';
    this.phone = '';
    this.address = '';
    this.sampleOn = this.getSampleTime();
    this.ipNo = '';
    this.doctor = '';
    this.outDoctor = '';
    this.hospital = '';
    this.corporate = '';
    this.discountMode = 'NORMAL';
    this.discountPercent = '';
    this.receivedAmount = '';
    this.balanceAmount = '';
    this.grossAmount = 0;
    this.note = '';
    this.roundOff = '';
    this.discountReason = '';
    this.tests = [{
      slNo: 1,
      testCode: '',
      testName: '',
      rate: null,
      discount: null,
      amount: null
    }];
    this.selectedTestSlNo = null;
  }

  private toTitleCase(value: string): string {
    if (!value) {
      return '';
    }
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getSampleTime(): string {
    return new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(',', '');
  }

  private formatSampleTime(sampleOn: string): string {
    if (!sampleOn) {
      return this.getSampleTime();
    }

    const date = new Date(sampleOn);
    if (Number.isNaN(date.getTime())) {
      return sampleOn;
    }

    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(',', '');
  }

  saveVisit(): void {
    this.isSaving = true;
    this.saveMessage = '';

    const payload = {
      lab_no: this.labNo.trim(),
      patient_name: this.buildPatientName(),
      gender: this.gender.toLowerCase(),
      age_years: Number(this.age) || 0,
      age_months: Number(this.month) || 0,
      phone: this.phone.trim(),
      address: this.address.trim(),
      sample_on: this.sampleOn,
      ip_no: this.ipNo.trim(),
      out_doctor_name: this.outDoctor.trim(),
      corporate_name: this.corporate.trim(),
      pay_mode: this.payMode.toLowerCase(),
      discount_mode: this.discountMode.toLowerCase(),
      discount_percent: Number(this.discountPercent) || 0,
      discount_reason: this.discountReason.trim(),
      received_amount: Number(this.receivedAmount) || 0,
      balance_amount: Number(this.balanceAmount) || 0,
      gross_amount: Number(this.grossAmount) || 0,
      round_off: Number(this.roundOff) || 0,
      note: this.note.trim(),
    };

    const targetVisitId = this.openMode === 'prefill-only'
      ? null
      : (this.currentVisitId ?? this.selectedVisitId);
    const request$ = targetVisitId
      ? this.visitService.updateVisit(targetVisitId, payload)
      : this.visitService.createVisit(payload);

    request$.subscribe({
      next: (savedVisit) => {
        this.currentVisitId = savedVisit.id;
        this.saveMessage = 'Saved successfully.';
        this.isSaving = false;
        this.applyVisitData(savedVisit);
      },
      error: (error: HttpErrorResponse) => {
        this.isSaving = false;
        this.saveMessage = error.status === 0
          ? 'Unable to reach backend.'
          : 'Save failed.';
      }
    });
  }

  openResultEntry(): void {
    const visitId = this.currentVisitId ?? this.selectedVisitId;
    if (visitId) {
      this.resultEntry.emit(visitId);
    }
  }

  private parsePatientName(value: string): { salutation: string; name: string } {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return { salutation: 'Mr', name: '' };
    }

    const parts = trimmed.split(/\s+/);
    const firstToken = parts[0].replace('.', '');
    const matched = this.salutations.find((item) => item.toLowerCase() === firstToken.toLowerCase());
    if (!matched) {
      return { salutation: 'Mr', name: trimmed };
    }

    return {
      salutation: matched,
      name: parts.slice(1).join(' ').trim()
    };
  }

  private buildPatientName(): string {
    const name = this.toUppercase(this.patientName.trim());
    const salutation = this.salutation.trim();
    this.patientName = name;
    if (!name) {
      return salutation;
    }
    return `${salutation} ${name}`;
  }

  private toUppercase(value: string): string {
    return (value || '').toUpperCase();
  }

  private focusNextControl(currentTarget: HTMLElement): void {
    const form = this.billFormElement?.nativeElement;
    if (!form) {
      return;
    }

    const controls = Array.from(
      form.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea, button[type="button"], button[type="submit"]')
    ).filter((el) => !el.hasAttribute('disabled') && this.isVisible(el));

    const currentIndex = controls.indexOf(currentTarget);
    if (currentIndex === -1) {
      return;
    }
    const next = controls[currentIndex + 1];
    next?.focus();
  }

  private focusByName(name: string): void {
    const form = this.billFormElement?.nativeElement;
    if (!form) {
      return;
    }
    const next = form.querySelector<HTMLElement>(`[name="${name}"]`);
    next?.focus();
  }

  private isVisible(element: HTMLElement): boolean {
    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  private extractSlNo(value: string, prefix: string): number | null {
    if (!value.startsWith(prefix)) {
      return null;
    }
    const parsed = Number(value.slice(prefix.length));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private recalculateSuggestionLayout(): void {
    const table = this.testTableElement?.nativeElement;
    if (!table) {
      return;
    }

    const headCells = table.querySelectorAll('thead th');
    if (headCells.length < 4) {
      return;
    }

    const shortNameWidth = Math.round((headCells[1] as HTMLElement).getBoundingClientRect().width);
    const testNameWidth = Math.round((headCells[2] as HTMLElement).getBoundingClientRect().width);
    const rateWidth = Math.round((headCells[3] as HTMLElement).getBoundingClientRect().width);

    this.suggestionWidthPx = shortNameWidth + testNameWidth + rateWidth;
    this.suggestionGridTemplate = `${shortNameWidth}px ${testNameWidth}px ${rateWidth}px`;
  }

}

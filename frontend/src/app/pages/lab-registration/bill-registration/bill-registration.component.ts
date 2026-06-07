import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, DestroyRef, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ClockService } from '../../../services/clock.service';
import { LabPrintConfig, TestLookupItem, UpiPaymentConfig, VisitDetail, VisitService } from '../../../services/visit.service';

interface TestLine {
  slNo: number;
  testId: number | null;
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
  @ViewChild('suggestionBoxElement') suggestionBoxElement?: ElementRef<HTMLDivElement>;
  @ViewChild('testCodeInput') testCodeInput?: ElementRef<HTMLInputElement>;
  @ViewChild('amountInput') amountInput?: ElementRef<HTMLInputElement>;
  @ViewChild('discModeSelect') discModeSelect?: ElementRef<HTMLSelectElement>;
  @ViewChild('discPercentInput') discPercentInput?: ElementRef<HTMLInputElement>;
  @ViewChild('receivedAmtInput') receivedAmtInput?: ElementRef<HTMLInputElement>;
  @ViewChild('roundOffInput') roundOffInput?: ElementRef<HTMLInputElement>;
  @ViewChild('discReasonInput') discReasonInput?: ElementRef<HTMLInputElement>;
  @ViewChild('saveButton') saveButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('saveConfirmYesButton') saveConfirmYesButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('saveConfirmNoButton') saveConfirmNoButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('saveAlertOkButton') saveAlertOkButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('upiSaveButton') upiSaveButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('upiCancelButton') upiCancelButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('billPrintCloseButton') billPrintCloseButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('editLabNoInput') editLabNoInput?: ElementRef<HTMLInputElement>;
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
  totalRate = 0;
  totalDiscountAmount = 0;
  grossAmount = 0;
  note = '';
  roundOff = '';
  discountReason = '';
  selectedTestSlNo: number | null = null;
  isLoadingVisit = false;
  isSaving = false;
  saveMessage = '';
  saveMessageIsError = false;
  loadError = '';
  showEditInvoiceDialog = false;
  showSaveConfirmDialog = false;
  showBillPrintPreview = false;
  saveDialogMode: 'confirm' | 'alert' = 'confirm';
  saveDialogMessage = '';
  editLabNo = '';
  editLookupError = '';
  showUpiPaymentDialog = false;
  upiPaymentConfig: UpiPaymentConfig | null = null;
  upiPaymentQrUrl = '';
  upiPaymentUri = '';
  upiPaymentAmount = '0';
  upiPaymentMessage = '';
  isLoadingUpiPaymentConfig = false;
  labPrintConfig: LabPrintConfig | null = null;
  isLoadingLabPrintConfig = false;
  billPrintData: VisitDetail | null = null;
  isLookingUpLabNo = false;
  editInvoiceMode: 'lookup' | 'form' = 'lookup';
  visitDate = this.today;
  editCollectedBy = '';
  editArea = '';
  urgentReport = false;
  emailToPatient = false;
  testSuggestions: TestLookupItem[] = [];
  activeSuggestionSlNo: number | null = null;
  activeSuggestionIndex = -1;
  isLoadingTestSuggestions = false;
  suggestionWidthPx = 0;
  suggestionGridTemplate = '';
  showCurrentEntryRow = true;
  private testLookupDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private currentVisitId: number | null = null;

  currentTest: TestLine = this.createBlankTestLine(1);
  tests: TestLine[] = [];

  constructor() {
    this.clockService.currentTime$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((currentTime) => {
        this.currentTime = currentTime;
      });

    this.loadLabPrintConfig();
  }

  ngAfterViewInit(): void {
    this.recalculateSuggestionLayout();
    setTimeout(() => this.recalculateSuggestionLayout(), 0);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.recalculateSuggestionLayout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const clickedInsideInput = this.testCodeInput?.nativeElement.contains(target);
    const clickedInsideSuggestions = this.suggestionBoxElement?.nativeElement.contains(target);

    if (!clickedInsideInput && !clickedInsideSuggestions) {
      this.activeSuggestionSlNo = null;
      this.testSuggestions = [];
      this.activeSuggestionIndex = -1;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (!this.showSaveConfirmDialog) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.saveDialogMode === 'confirm') {
        this.cancelSaveConfirmation();
      } else {
        this.acknowledgeSaveAlert();
      }
      return;
    }

    if (this.saveDialogMode === 'alert') {
      if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.acknowledgeSaveAlert();
      }
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.toggleSaveDialogFocus(event.key === 'ArrowRight' || event.key === 'ArrowDown');
      return;
    }

    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      const activeElement = document.activeElement;
      if (activeElement === this.saveConfirmNoButton?.nativeElement) {
        this.cancelSaveConfirmation();
      } else {
        this.confirmSave();
      }
    }
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
    this.commitCurrentTest();
  }

  private createBlankTestLine(slNo: number): TestLine {
    return {
      slNo,
      testId: null,
      testCode: '',
      testName: '',
      rate: null,
      discount: null,
      amount: null
    };
  }

  private roundBillAmount(value: number): number {
    const safeValue = Math.max(Number(value) || 0, 0);
    return Math.round(safeValue / 10) * 10;
  }

  private roundDiscountPercent(value: number): number {
    return Math.max(Math.round(Number(value) || 0), 0);
  }

  private isTestFilled(test: TestLine): boolean {
    if (!test.testCode || !test.testCode.trim()) {
      return false;
    }
    return !!test.testName.trim() || !!Number(test.rate) || !!Number(test.discount) || !!Number(test.amount);
  }

  private getEditableLineBySlNo(slNo: number | null): TestLine | undefined {
    if (slNo === this.currentTest.slNo) {
      return this.currentTest;
    }
    return this.tests.find((item) => item.slNo === slNo);
  }

  private commitCurrentTest(): void {
    if (!this.isTestFilled(this.currentTest)) {
      return;
    }

    const committedLine: TestLine = {
      ...this.currentTest,
      slNo: this.tests.length + 1
    };
    this.tests = [...this.tests, committedLine];
    this.currentTest = this.createBlankTestLine(this.tests.length + 1);
    this.selectedTestSlNo = null;
    this.updateGrossAmount();
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
    this.currentTest.slNo = this.tests.length + 1;
    this.selectedTestSlNo = null;
    this.updateGrossAmount();
  }

  updateAmount(test: TestLine): void {
    const rate = Number(test.rate) || 0;
    const discount = Number(test.discount) || 0;
    test.amount = this.roundBillAmount(Math.max(rate - (rate * discount / 100), 0));
    this.updateGrossAmount();
  }

  getPaymentStatus(): string {
    const received = Number(this.receivedAmount) || 0;
    const balance = Number(this.balanceAmount) || 0;

    if (balance > 0) {
      return 'Pending';
    }

    if (received > 0) {
      return 'Paid';
    }

    return this.tests.length > 0 ? 'Unpaid' : 'No tests';
  }

  onPatientNameEnter(event: Event): void {
    event.preventDefault();
    this.patientName = this.toUppercase(this.patientName);
  }

  onFormKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (target.tagName === 'TEXTAREA') {
      return;
    }

    const targetName = (target as HTMLInputElement | HTMLSelectElement).name || '';

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const slNo = targetName.startsWith('testCode') ? this.extractSlNo(targetName, 'testCode') : null;
      if (slNo !== null && this.activeSuggestionSlNo === slNo && this.testSuggestions.length > 0) {
        event.preventDefault();
        this.moveSuggestionSelection(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }

    if (event.key === 'Enter') {
      if (targetName === 'saveButton') {
        this.promptSave(event);
        return;
      }
      if (
        targetName.startsWith('testCode') || 
        targetName.startsWith('amount') ||
        ['discountMode', 'discountPercent', 'receivedAmount', 'roundOff', 'discountReason'].includes(targetName)
      ) {
        return;
      }
      this.onFormEnter(event, target, targetName);
      return;
    }
  }

  promptSave(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.showSaveConfirmDialog || this.isSaving) {
      return;
    }

    const validationMessage = this.getSaveValidationMessage();
    if (validationMessage) {
      this.saveDialogMode = 'alert';
      this.saveDialogMessage = validationMessage;
      this.showSaveConfirmDialog = true;
      setTimeout(() => this.saveAlertOkButton?.nativeElement.focus(), 0);
      return;
    }

    if (this.payMode.trim().toLowerCase() === 'upi') {
      this.openUpiPaymentDialog();
      return;
    }

    this.saveDialogMode = 'confirm';
    this.saveDialogMessage = 'Do you want to save this bill/registration now?';
    this.showSaveConfirmDialog = true;
    setTimeout(() => this.saveConfirmYesButton?.nativeElement.focus(), 0);
  }

  confirmSave(): void {
    if (!this.showSaveConfirmDialog || this.isSaving) {
      return;
    }

    this.showSaveConfirmDialog = false;
    this.saveVisit();
  }

  cancelSaveConfirmation(): void {
    this.showSaveConfirmDialog = false;
  }

  acknowledgeSaveAlert(): void {
    this.showSaveConfirmDialog = false;
  }

  openUpiPaymentDialog(): void {
    if (this.isSaving) {
      return;
    }

    this.showSaveConfirmDialog = false;
    this.showUpiPaymentDialog = true;
    this.upiPaymentMessage = '';
    this.upiPaymentAmount = this.getPayableAmount().toFixed(0);
    this.receivedAmount = this.upiPaymentAmount;
    this.updateBalanceAmount();

    if (this.upiPaymentConfig) {
      this.buildUpiQrCode();
      setTimeout(() => this.upiSaveButton?.nativeElement.focus(), 0);
      return;
    }

    this.isLoadingUpiPaymentConfig = true;
    this.visitService.getUpiPaymentConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (config) => {
        this.upiPaymentConfig = config;
        this.isLoadingUpiPaymentConfig = false;
        this.buildUpiQrCode();
        setTimeout(() => this.upiSaveButton?.nativeElement.focus(), 0);
      },
      error: () => {
        this.isLoadingUpiPaymentConfig = false;
        this.upiPaymentConfig = null;
        this.upiPaymentQrUrl = '';
        this.upiPaymentUri = '';
        this.upiPaymentMessage = 'UPI payment details are not configured yet. Ask the admin to set the backend .env values.';
        setTimeout(() => this.upiCancelButton?.nativeElement.focus(), 0);
      }
    });
  }

  confirmUpiPaymentAndSave(): void {
    if (!this.showUpiPaymentDialog || this.isSaving) {
      return;
    }

    this.showUpiPaymentDialog = false;
    this.saveVisit();
  }

  cancelUpiPaymentDialog(): void {
    this.showUpiPaymentDialog = false;
    this.upiPaymentQrUrl = '';
    this.upiPaymentUri = '';
    this.upiPaymentMessage = '';
  }

  onTestCodeKeyDown(test: TestLine, event: KeyboardEvent): void {
    if (this.activeSuggestionSlNo !== test.slNo || this.testSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.moveSuggestionSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.applyActiveSuggestion(test);
    }
  }

  onCurrentTestCodeEnter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.activeSuggestionSlNo === this.currentTest.slNo && this.testSuggestions.length > 0) {
      this.applyActiveSuggestion(this.currentTest);
      return;
    }

    if (!this.currentTest.testCode || !this.currentTest.testCode.trim()) {
      this.currentTest.testCode = '';
      this.currentTest.testName = '';
      this.currentTest.rate = null;
      this.currentTest.discount = null;
      this.currentTest.amount = null;
      this.updateGrossAmount();
    }

    setTimeout(() => {
      this.amountInput?.nativeElement.focus();
    }, 10);
  }

  onCurrentTestAmountEnter(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.currentTest.testCode && !this.currentTest.amount) {
      setTimeout(() => {
        this.discModeSelect?.nativeElement.focus();
      }, 10);
      return;
    }

    if (!this.isTestFilled(this.currentTest)) {
      this.testCodeInput?.nativeElement.focus();
      return;
    }

    this.commitCurrentTest();
    setTimeout(() => {
      this.testCodeInput?.nativeElement.focus();
    }, 30);
  }

  onBottomFieldEnter(event: Event, currentFieldName: string): void {
    event.preventDefault();
    event.stopPropagation();

    switch (currentFieldName) {
      case 'discMode':
        this.discPercentInput?.nativeElement.focus();
        break;
      case 'discPercent':
        this.receivedAmtInput?.nativeElement.focus();
        break;
      case 'receivedAmt':
        this.roundOffInput?.nativeElement.focus();
        break;
      case 'roundOff':
        this.discReasonInput?.nativeElement.focus();
        break;
      case 'discReason':
        this.focusByName('discountMode'); 
        const form = this.billFormElement?.nativeElement;
        const grossAmountField = form?.querySelector('input[title="Net Amount"]') as HTMLElement;
        grossAmountField?.focus();
        break;
      case 'grossAmt':
        setTimeout(() => {
          this.saveButton?.nativeElement.focus();
        }, 10);
        break;
    }
  }

  moveSuggestionSelection(direction: 1 | -1): void {
    if (this.testSuggestions.length === 0) return;
    let nextIndex = this.activeSuggestionIndex + direction;
    if (nextIndex < 0) nextIndex = this.testSuggestions.length - 1;
    if (nextIndex >= this.testSuggestions.length) nextIndex = 0;
    this.activeSuggestionIndex = nextIndex;
    setTimeout(() => this.scrollActiveSuggestionIntoView(), 0);
  }

  scrollActiveSuggestionIntoView(): void {
    if (this.suggestionBoxElement && this.activeSuggestionIndex >= 0) {
      const box = this.suggestionBoxElement.nativeElement;
      const rows = box.querySelectorAll('.suggestion-row');
      if (rows && rows[this.activeSuggestionIndex]) {
        (rows[this.activeSuggestionIndex] as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  private applyActiveSuggestion(test: TestLine): void {
    const selectedSuggestion = this.testSuggestions[this.activeSuggestionIndex >= 0 ? this.activeSuggestionIndex : 0];
    if (!selectedSuggestion) {
      return;
    }
    this.selectTestSuggestion(test, selectedSuggestion);
    
    this.activeSuggestionSlNo = null;
    this.testSuggestions = [];
    this.activeSuggestionIndex = -1;

    setTimeout(() => {
      this.amountInput?.nativeElement.focus();
    }, 30);
  }

  onFormEnter(event: KeyboardEvent, target?: HTMLElement | null, targetName?: string): void {
    const currentTarget = target ?? (event.target as HTMLElement | null);
    if (!currentTarget) {
      return;
    }

    const currentTargetName = targetName ?? ((currentTarget as HTMLInputElement | HTMLSelectElement).name || '');

    if (['discountMode', 'discountPercent', 'receivedAmount', 'balanceAmount', 'note', 'roundOff', 'discountReason'].includes(currentTargetName)) {
      event.preventDefault();
      return;
    }

    event.preventDefault();

    if (currentTargetName === 'patientName') {
      this.patientName = this.toUppercase(this.patientName);
    }

    if (target) {
      this.focusNextControl(target);
    }
  }

  openEditInvoiceLookup(): void {
    this.showEditInvoiceDialog = true;
    this.editInvoiceMode = 'lookup';
    this.editLabNo = '';
    this.editLookupError = '';
    setTimeout(() => this.editLabNoInput?.nativeElement.focus(), 0);
  }

  closeEditInvoiceLookup(): void {
    this.showEditInvoiceDialog = false;
    this.editLookupError = '';
    this.editInvoiceMode = 'lookup';
  }

  openBillPrintPreview(): void {
    if (!this.billPrintData) {
      return;
    }

    this.showBillPrintPreview = true;
    setTimeout(() => this.billPrintCloseButton?.nativeElement.focus(), 0);
  }

  closeBillPrintPreview(): void {
    this.showBillPrintPreview = false;
  }

  printBillPreview(): void {
    window.print();
  }

  startEditInvoiceLookup(): void {
    this.editInvoiceMode = 'lookup';
    this.editLabNo = '';
    this.editLookupError = '';
    setTimeout(() => this.editLabNoInput?.nativeElement.focus(), 0);
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
        this.editInvoiceMode = 'form';
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
          this.activeSuggestionIndex = rows.length > 0 ? 0 : -1;
          this.recalculateSuggestionLayout();
          this.isLoadingTestSuggestions = false;
          setTimeout(() => this.scrollActiveSuggestionIntoView(), 0);
        },
        error: () => {
          this.activeSuggestionSlNo = null;
          this.testSuggestions = [];
          this.activeSuggestionIndex = -1;
          this.isLoadingTestSuggestions = false;
        }
      });
    }, 150);
  }

  selectTestSuggestion(test: TestLine, selected: TestLookupItem): void {
    test.testId = selected.id;
    test.testCode = selected.short_name || selected.test_code;
    test.testName = selected.test_name;
    test.rate = Number(selected.rate) || 0;
    test.discount = this.roundDiscountPercent(Number(selected.default_discount_percent) || 0);
    const defaultAmount = Number(selected.default_amount) || 0;
    test.amount = defaultAmount > 0
      ? this.roundBillAmount(defaultAmount)
      : this.roundBillAmount(Math.max(Number(test.rate) - (Number(test.rate) * Number(test.discount) / 100), 0));
    this.updateGrossAmount();
    this.activeSuggestionSlNo = null;
    this.testSuggestions = [];
    this.activeSuggestionIndex = -1;
  }

  closeTestSuggestion(): void {
  }

  onReceivedAmountChange(): void {
    this.updateBalanceAmount();
  }

  onRoundOffChange(): void {
    this.updateBalanceAmount();
  }

  private updateGrossAmount(): void {
    let committedRate = this.tests.reduce((total, item) => total + (Number(item.rate) || 0), 0);
    let committedAmount = this.tests.reduce((total, item) => total + (Number(item.amount) || 0), 0);

    const currentRate = Number(this.currentTest.rate) || 0;
    const currentAmount = Number(this.currentTest.amount) || 0;

    this.totalRate = committedRate + currentRate;
    this.grossAmount = committedAmount + currentAmount;
    this.totalDiscountAmount = Math.max(this.totalRate - this.grossAmount, 0);

    this.updateBalanceAmount();
  }

  private updateBalanceAmount(): void {
    const received = Number(this.receivedAmount) || 0;
    const roundOff = Number(this.roundOff) || 0;
    const netPayable = this.grossAmount + roundOff;
    const balance = Math.max(netPayable - received, 0);
    this.balanceAmount = balance.toFixed(0);
  }

  private loadLabPrintConfig(): void {
    this.isLoadingLabPrintConfig = true;
    this.visitService.getLabPrintConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (config) => {
        this.labPrintConfig = config;
        this.isLoadingLabPrintConfig = false;
      },
      error: () => {
        this.labPrintConfig = null;
        this.isLoadingLabPrintConfig = false;
      }
    });
  }

  private getPayableAmount(): number {
    const roundOff = Number(this.roundOff) || 0;
    return Math.max((Number(this.grossAmount) || 0) + roundOff, 0);
  }

  private getSavedAmount(visit: VisitDetail): number {
    const totalRate = (visit.tests || []).reduce((total, test) => total + (Number(test.rate) || 0), 0);
    const billedAmount = (visit.tests || []).reduce((total, test) => total + (Number(test.amount) || 0), 0);
    return Math.max(totalRate - billedAmount, 0);
  }

  private buildUpiQrCode(): void {
    const config = this.upiPaymentConfig;
    if (!config?.upi_id) {
      this.upiPaymentQrUrl = '';
      this.upiPaymentUri = '';
      this.upiPaymentMessage = 'UPI ID is missing from the backend configuration.';
      return;
    }

    const amount = this.getPayableAmount().toFixed(0);
    const payeeName = config.payee_name || 'Lab Payments';
    const note = config.note || `Lab bill ${this.labNo}`;
    const params = new URLSearchParams({
      pa: config.upi_id,
      pn: payeeName,
      am: amount,
      cu: config.currency || 'INR',
      tn: note
    });
    if (config.merchant_code) {
      params.set('mc', config.merchant_code);
    }

    this.upiPaymentUri = `upi://pay?${params.toString()}`;
    this.upiPaymentQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(this.upiPaymentUri)}`;
    this.upiPaymentMessage = '';
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
    this.showSaveConfirmDialog = false;
    this.saveMessage = '';
    this.saveMessageIsError = false;
    this.billPrintData = visit;
    this.labNo = visit.lab_no;
    this.visitDate = visit.visit_date || this.today;
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
    this.discountPercent = String(this.roundDiscountPercent(Number(visit.discount_percent ?? 0)));
    this.receivedAmount = String(visit.received_amount ?? '');
    this.balanceAmount = String(this.roundBillAmount(Number(visit.balance_amount) || 0));
    this.grossAmount = this.roundBillAmount(Number(visit.gross_amount) || 0);
    this.note = visit.note;
    this.roundOff = String(visit.round_off ?? '');
    this.discountReason = visit.discount_reason;
    this.editCollectedBy = visit.doctor || visit.out_doctor_name || '';
    this.editArea = visit.hospital || '';
    this.urgentReport = false;
    this.emailToPatient = false;

    const mappedTests = visit.tests
      .sort((a, b) => a.line_order - b.line_order)
      .map((test, index) => ({
        slNo: index + 1,
        testId: test.test_id,
        testCode: test.test_code || '',
        testName: test.test_name || '',
        rate: Number(test.rate) || 0,
        discount: this.roundDiscountPercent(Number(test.discount_percent) || 0),
        amount: this.roundBillAmount(Number(test.amount) || 0),
      }));

    this.tests = mappedTests;
    this.currentTest = this.createBlankTestLine(this.tests.length + 1);
    this.selectedTestSlNo = null;
    this.updateGrossAmount();
  }

  private applyPrefillOnlyData(visit: VisitDetail): void {
    this.showSaveConfirmDialog = false;
    this.saveMessage = '';
    this.saveMessageIsError = false;
    this.visitDate = visit.visit_date || this.today;
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
    this.editCollectedBy = visit.doctor || visit.out_doctor_name || '';
    this.editArea = visit.hospital || '';
    this.urgentReport = false;
    this.emailToPatient = false;

    this.tests = [];
    this.currentTest = this.createBlankTestLine(this.tests.length + 1);
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
    this.selectedVisitId = null;
    this.showSaveConfirmDialog = false;
    this.showUpiPaymentDialog = false;
    this.saveMessage = '';
    this.saveMessageIsError = false;
    this.visitDate = this.today;
    this.payMode = 'Cash';
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
    this.totalRate = 0;
    this.totalDiscountAmount = 0;
    this.grossAmount = 0;
    this.note = '';
    this.roundOff = '';
    this.discountReason = '';
    this.editCollectedBy = '';
    this.editArea = '';
    this.urgentReport = false;
    this.emailToPatient = false;
    this.tests = [];
    this.showCurrentEntryRow = false;
    this.currentTest = this.createBlankTestLine(1);
    this.selectedTestSlNo = null;
    this.testSuggestions = [];
    this.activeSuggestionSlNo = null;
    this.activeSuggestionIndex = -1;
    this.isLoadingTestSuggestions = false;
    this.suggestionWidthPx = 0;
    this.suggestionGridTemplate = '';
    this.upiPaymentConfig = null;
    this.upiPaymentQrUrl = '';
    this.upiPaymentUri = '';
    this.upiPaymentAmount = '0';
    this.upiPaymentMessage = '';
    this.isLoadingUpiPaymentConfig = false;
    this.updateGrossAmount();
    setTimeout(() => {
      this.currentTest = this.createBlankTestLine(1);
      this.showCurrentEntryRow = true;
    }, 0);
    this.loadNextLabNo();
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

  private loadNextLabNo(): void {
    this.visitService.getNextLabNo().subscribe({
      next: (response) => {
        this.labNo = response.lab_no;
      },
      error: () => {
        this.labNo = '00001';
      }
    });
  }

  private getPersistableTests(): TestLine[] {
    const committedTests = this.tests.map((test) => ({ ...test }));
    if (this.isTestFilled(this.currentTest)) {
      committedTests.push({
        ...this.currentTest,
        slNo: committedTests.length + 1
      });
    }

    return committedTests.map((test, index) => ({
      ...test,
      slNo: index + 1
    }));
  }

  private getSaveValidationMessage(): string {
    const patientName = this.patientName.trim();
    if (!patientName) {
      return 'Enter patient name before saving.';
    }

    if (this.tests.length === 0) {
      return 'Add at least 1 test before saving.';
    }

    return '';
  }

  saveVisit(): void {
    const validationMessage = this.getSaveValidationMessage();
    if (validationMessage) {
      this.saveDialogMode = 'alert';
      this.saveDialogMessage = validationMessage;
      this.showSaveConfirmDialog = true;
      this.isSaving = false;
      this.saveMessage = '';
      this.saveMessageIsError = false;
      return;
    }

    this.isSaving = true;
    this.saveMessage = '';
    this.saveMessageIsError = false;
    const persistableTests = this.getPersistableTests();

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
      discount_percent: this.roundDiscountPercent(Number(this.discountPercent) || 0),
      discount_reason: this.discountReason.trim(),
      received_amount: Number(this.receivedAmount) || 0,
      balance_amount: Number(this.balanceAmount) || 0,
      gross_amount: this.roundBillAmount(Number(this.grossAmount) || 0),
      round_off: Number(this.roundOff) || 0,
      note: this.note.trim(),
      tests: persistableTests.map((test, index) => ({
        test_id: test.testId,
        test_code: test.testCode.trim(),
        test_name: test.testName.trim(),
        rate: Number(test.rate) || 0,
        discount: this.roundDiscountPercent(Number(test.discount) || 0),
        amount: this.roundBillAmount(Number(test.amount) || 0),
        line_order: index + 1,
      })),
    };

    const targetVisitId = this.openMode === 'prefill-only'
      ? null
      : (this.currentVisitId ?? this.selectedVisitId);
    const request$ = targetVisitId
      ? this.visitService.updateVisit(targetVisitId, payload)
      : this.visitService.createVisit(payload);

    request$.subscribe({
      next: (savedVisit) => {
        this.billPrintData = savedVisit;
        this.showBillPrintPreview = true;
        this.saveMessage = 'Saved successfully.';
        this.saveMessageIsError = false;
        this.isSaving = false;
        this.showSaveConfirmDialog = false;
        this.resetForNewRegistration();
        this.saveMessage = 'Saved successfully.';
        this.saveMessageIsError = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isSaving = false;
        this.saveMessage = '';
        this.saveMessageIsError = false;
        this.saveDialogMode = 'alert';
        this.saveDialogMessage = error.status === 0
          ? 'Unable to reach backend.'
          : error.status === 400 && typeof error.error?.detail === 'string'
            ? error.error.detail
            : error.status === 409
              ? 'Lab number already exists. A new number will be assigned.'
              : 'Save failed.';
        this.showSaveConfirmDialog = true;
        setTimeout(() => this.saveAlertOkButton?.nativeElement.focus(), 0);
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
      form.querySelectorAll<HTMLElement>('input:not([type=\"hidden\"]), select, textarea, button[type=\"button\"], button[type=\"submit\"]')
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
    const next = form.querySelector<HTMLElement>(`[name=\"${name}\"]`);
    next?.focus();
  }

  private toggleSaveDialogFocus(_moveForward: boolean): void {
    if (this.saveDialogMode === 'alert') {
      this.saveAlertOkButton?.nativeElement.focus();
      return;
    }

    const yesButton = this.saveConfirmYesButton?.nativeElement;
    const noButton = this.saveConfirmNoButton?.nativeElement;
    const activeElement = document.activeElement;

    if (activeElement === noButton) {
      yesButton?.focus();
      return;
    }

    noButton?.focus();
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

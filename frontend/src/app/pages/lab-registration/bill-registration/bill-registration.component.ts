import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ClockService } from '../../../services/clock.service';
import { VisitDetail, VisitService } from '../../../services/visit.service';

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
export class BillRegistrationComponent implements OnChanges {
  @Input() selectedVisitId: number | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() advanceSearch = new EventEmitter<void>();

  private readonly clockService = inject(ClockService);
  private readonly visitService = inject(VisitService);
  private readonly destroyRef = inject(DestroyRef);

  readonly paymentModes = ['Cash', 'Card', 'UPI', 'Credit'];
  readonly discountModes = ['NORMAL', 'CORPORATE', 'STAFF'];
  readonly today = this.getTodayDate();

  currentTime = new Date();
  labNo = '00001';
  payMode = 'Cash';
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
  loadError = '';

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

  ngOnChanges(changes: SimpleChanges): void {
    const selectedVisitIdChange = changes['selectedVisitId'];
    if (!selectedVisitIdChange) {
      return;
    }

    if (this.selectedVisitId === null) {
      return;
    }

    this.loadVisit(this.selectedVisitId);
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

  private updateGrossAmount(): void {
    this.grossAmount = this.tests.reduce((total, item) => total + (Number(item.amount) || 0), 0);
  }

  private loadVisit(visitId: number): void {
    this.isLoadingVisit = true;
    this.loadError = '';

    this.visitService.getVisitById(visitId).subscribe({
      next: (visit) => {
        this.applyVisitData(visit);
        this.isLoadingVisit = false;
      },
      error: (error: HttpErrorResponse) => {
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
    this.patientName = visit.patient_name;
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

}

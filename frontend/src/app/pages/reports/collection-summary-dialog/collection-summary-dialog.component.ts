import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VisitService, VisitSummary } from '../../../services/visit.service';

type SummaryMode = 'daily' | 'monthly' | 'department-wise-daily' | 'department-wise-monthly';

interface StatementRow {
  slNo: number;
  invNo: string;
  patient: string;
  credit: number;
  cash: number;
  received: number;
  visitDate: string;
}

@Component({
  selector: 'app-collection-summary-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collection-summary-dialog.component.html',
  styleUrl: './collection-summary-dialog.component.css'
})
export class CollectionSummaryDialogComponent implements OnChanges {
  @Input() mode: SummaryMode = 'daily';
  @Input() title = 'Collection Summary';
  @Output() closed = new EventEmitter<void>();

  private readonly visitService = inject(VisitService);

  fromDate = this.getTodayDate();
  toDate = this.getTodayDate();
  selectedMonth = this.getCurrentMonthValue();
  selectedDepartment = 'All';
  readonly departments = ['All', 'BIOCHEMISTRY', 'HEMATOLOGY', 'MICROBIOLOGY', 'IMMUNOLOGY'];

  isLoading = false;
  errorMessage = '';
  rows: StatementRow[] = [];
  pendingRows: StatementRow[] = [];

  totalBillAmount = 0;
  totalReceived = 0;
  totalPendingAmount = 0;
  netBalance = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode']) {
      this.initializeDatesByMode();
      this.preview();
    }
  }

  preview(): void {
    this.isLoading = true;
    this.errorMessage = '';

    const period = this.getDateRangeForMode();

    this.visitService.getVisits({
      fromDate: period.fromDate,
      toDate: period.toDate,
      department: this.isDepartmentWiseMode() ? this.selectedDepartment : undefined,
      splitByDepartment: this.isDepartmentWiseMode() && this.selectedDepartment !== 'All',
    }).subscribe({
      next: (visits) => {
        this.buildStatement(visits);
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.rows = [];
        this.pendingRows = [];
        this.totalBillAmount = 0;
        this.totalReceived = 0;
        this.totalPendingAmount = 0;
        this.netBalance = 0;
        this.errorMessage = error.status === 0
          ? 'Unable to reach backend.'
          : 'Unable to load collection preview.';
        this.isLoading = false;
      }
    });
  }

  private buildStatement(visits: VisitSummary[]): void {
    const sortedVisits = [...visits].sort((a, b) => {
      const aDate = `${a.visit_date} ${a.created_at || ''}`;
      const bDate = `${b.visit_date} ${b.created_at || ''}`;
      return aDate.localeCompare(bDate);
    });

    this.rows = sortedVisits.map((visit, index) => {
      const gross = Number(visit.gross_amount) || 0;
      const received = Number(visit.received_amount) || 0;
      const balance = Number(visit.balance_amount) || 0;

      return {
        slNo: index + 1,
        invNo: visit.lab_no,
        patient: visit.patient,
        credit: balance,
        cash: gross,
        received,
        visitDate: this.formatDisplayDate(visit.visit_date),
      };
    });

    this.pendingRows = this.rows.filter((row) => row.credit > 0);
    this.totalBillAmount = this.rows.reduce((sum, row) => sum + row.cash, 0);
    this.totalReceived = this.rows.reduce((sum, row) => sum + row.received, 0);
    this.totalPendingAmount = this.rows.reduce((sum, row) => sum + row.credit, 0);
    this.netBalance = this.totalBillAmount - this.totalPendingAmount;
  }

  private initializeDatesByMode(): void {
    if (this.mode === 'monthly' || this.mode === 'department-wise-monthly') {
      const currentMonth = this.getCurrentMonthValue();
      this.selectedMonth = currentMonth;
      const range = this.getMonthRange(currentMonth);
      this.fromDate = range.fromDate;
      this.toDate = range.toDate;
      return;
    }

    this.fromDate = this.getTodayDate();
    this.toDate = this.getTodayDate();
  }

  private getDateRangeForMode(): { fromDate: string; toDate: string } {
    if (this.mode === 'monthly' || this.mode === 'department-wise-monthly') {
      return this.getMonthRange(this.selectedMonth);
    }

    return {
      fromDate: this.fromDate,
      toDate: this.toDate,
    };
  }

  private getMonthRange(monthValue: string): { fromDate: string; toDate: string } {
    const [yearText, monthText] = monthValue.split('-');
    const year = Number(yearText);
    const month = Number(monthText);

    if (!year || !month) {
      const today = this.getTodayDate();
      return { fromDate: today, toDate: today };
    }

    const lastDate = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, '0');
    return {
      fromDate: `${year}-${mm}-01`,
      toDate: `${year}-${mm}-${String(lastDate).padStart(2, '0')}`,
    };
  }

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getCurrentMonthValue(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private formatDisplayDate(dateValue: string): string {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  isDepartmentWiseMode(): boolean {
    return this.mode === 'department-wise-daily' || this.mode === 'department-wise-monthly';
  }

}

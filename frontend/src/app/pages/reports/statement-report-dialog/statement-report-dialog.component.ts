import { Component, Input, Output, EventEmitter, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AccountsService, AccountHead, CashTransaction, JournalEntry } from '../../../services/accounts.service';

type ReportAction =
  | 'payments-statement'
  | 'receipts-statement'
  | 'income-expense-statement'
  | 'other-income-expense-statement'
  | 'ledger'
  | 'cash-statement'
  | 'bank-statement'
  | 'doctors'
  | 'hospitals'
  | 'patients'
  | 'employees'
  | 'departments'
  | 'units'
  | 'test-price-list'
  | 'test-detailed';

@Component({
  selector: 'app-statement-report-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './statement-report-dialog.component.html',
  styleUrl: './statement-report-dialog.component.css'
})
export class StatementReportDialogComponent implements OnChanges {
  @Input() action: ReportAction = 'payments-statement';
  @Input() title = 'Statement Report';
  @Output() closed = new EventEmitter<void>();

  private readonly http = inject(HttpClient);
  private readonly accountsService = inject(AccountsService);

  fromDate = this.getTodayDate();
  toDate = this.getTodayDate();

  // For Ledger
  accountHeads: AccountHead[] = [];
  selectedAccountHeadId: number | null = null;
  openingBalance = 0;
  closingBalance = 0;

  isLoading = false;
  errorMessage = '';

  // Data rows
  rows: any[] = [];
  totals: { [key: string]: number } = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['action']) {
      this.rows = [];
      this.errorMessage = '';
      this.selectedAccountHeadId = null;
      if (this.action === 'ledger') {
        this.loadAccountHeads();
      } else if (this.isMasterReport()) {
        this.preview();
      }
    }
  }

  isDateRangeNeeded(): boolean {
    return [
      'payments-statement',
      'receipts-statement',
      'income-expense-statement',
      'other-income-expense-statement',
      'ledger',
      'cash-statement',
      'bank-statement'
    ].includes(this.action);
  }

  isMasterReport(): boolean {
    return [
      'doctors',
      'hospitals',
      'patients',
      'employees',
      'departments',
      'units',
      'test-price-list',
      'test-detailed'
    ].includes(this.action);
  }

  loadAccountHeads(): void {
    this.accountsService.getAccountHeads().subscribe({
      next: (heads) => {
        this.accountHeads = heads.filter(h => h.is_active);
      },
      error: () => {
        this.errorMessage = 'Failed to load account heads.';
      }
    });
  }

  preview(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.rows = [];
    this.totals = {};

    if (this.action === 'ledger' && !this.selectedAccountHeadId) {
      this.errorMessage = 'Please select an Account Head.';
      this.isLoading = false;
      return;
    }

    if (this.isMasterReport()) {
      this.loadMasterReport();
    } else {
      this.loadStatementReport();
    }
  }

  private loadMasterReport(): void {
    let url = '';
    switch (this.action) {
      case 'doctors': url = 'http://localhost:8000/api/doctors/'; break;
      case 'hospitals': url = 'http://localhost:8000/api/hospitals/'; break;
      case 'patients': url = 'http://localhost:8000/api/patients/'; break;
      case 'employees': url = 'http://localhost:8000/api/users/'; break;
      case 'departments': url = 'http://localhost:8000/api/departments/'; break;
      case 'units': url = 'http://localhost:8000/api/units/'; break;
      case 'test-price-list':
      case 'test-detailed': url = 'http://localhost:8000/api/tests-detailed/'; break;
    }

    if (!url) {
      // Mock/Empty fallback for unimplemented placeholders (divisions, methods, technologies)
      this.rows = [];
      this.isLoading = false;
      return;
    }

    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.rows = data.map((item, index) => ({ slNo: index + 1, ...item }));
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load report data.';
        this.isLoading = false;
      }
    });
  }

  private loadStatementReport(): void {
    if (this.action === 'ledger') {
      this.loadLedgerReport();
      return;
    }

    let params = new HttpParams()
      .set('from_date', this.fromDate)
      .set('to_date', this.toDate);

    if (this.action === 'payments-statement') {
      params = params.set('tx_type', 'payment');
    } else if (this.action === 'receipts-statement') {
      params = params.set('tx_type', 'receipt');
    }

    this.http.get<CashTransaction[]>('http://localhost:8000/api/transactions/', { params }).subscribe({
      next: (data) => {
        let filteredData = data;
        if (this.action === 'bank-statement') {
          filteredData = data.filter(t => t.account_head_name?.toLowerCase().includes('bank'));
        } else if (this.action === 'cash-statement') {
          filteredData = data.filter(t => !t.account_head_name?.toLowerCase().includes('bank'));
        } else if (this.action === 'income-expense-statement') {
          filteredData = data.filter(t => ['revenue', 'expense'].includes(t.account_head_group || ''));
        } else if (this.action === 'other-income-expense-statement') {
          filteredData = data.filter(t => !['revenue', 'expense'].includes(t.account_head_group || ''));
        }

        this.rows = filteredData.map((item, index) => ({
          slNo: index + 1,
          voucher_no: item.voucher_no,
          date: this.formatDisplayDate(item.transaction_date),
          account_head_name: item.account_head_name,
          narration: item.narration,
          amount: Number(item.amount)
        }));

        this.totals['amount'] = this.rows.reduce((sum, row) => sum + row.amount, 0);
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load statement transactions.';
        this.isLoading = false;
      }
    });
  }

  private loadLedgerReport(): void {
    const head = this.accountHeads.find(h => h.id === Number(this.selectedAccountHeadId));
    if (!head) {
      this.errorMessage = 'Invalid Account Head selected.';
      this.isLoading = false;
      return;
    }

    const group = head.group;

    const txParams = new HttpParams().set('account_head', String(this.selectedAccountHeadId));
    const jParams = new HttpParams().set('account_head', String(this.selectedAccountHeadId));

    this.http.get<CashTransaction[]>('http://localhost:8000/api/transactions/', { params: txParams }).subscribe({
      next: (txs) => {
        this.http.get<JournalEntry[]>('http://localhost:8000/api/journals/', { params: jParams }).subscribe({
          next: (journals) => {
            const allItems: any[] = [];
            
            txs.forEach(t => {
              const dateVal = t.transaction_date;
              const isPayment = t.tx_type === 'payment';
              const amt = Number(t.amount);

              const debit = isPayment ? amt : 0;
              const credit = isPayment ? 0 : amt;

              allItems.push({
                date: dateVal,
                voucher: t.voucher_no,
                type: isPayment ? 'Payment' : 'Receipt',
                narration: t.narration,
                debit,
                credit
              });
            });

            journals.forEach(j => {
              j.lines.forEach(l => {
                if (l.account_head === this.selectedAccountHeadId) {
                  allItems.push({
                    date: j.entry_date,
                    voucher: `JV-${j.id}`,
                    type: 'Journal',
                    narration: j.narration,
                    debit: Number(l.debit),
                    credit: Number(l.credit)
                  });
                }
              });
            });

            allItems.sort((a, b) => a.date.localeCompare(b.date));

            let runningBal = 0;
            const isDebitIncrease = ['asset', 'expense'].includes(group);

            const filteredRows: any[] = [];
            let openBal = 0;

            allItems.forEach(item => {
              const change = isDebitIncrease
                ? (item.debit - item.credit)
                : (item.credit - item.debit);

              if (item.date < this.fromDate) {
                openBal += change;
              } else if (item.date <= this.toDate) {
                runningBal += change;
                filteredRows.push({
                  ...item,
                  balance: openBal + runningBal
                });
              }
            });

            this.openingBalance = openBal;
            this.closingBalance = openBal + runningBal;

            this.rows = filteredRows.map((item, index) => ({
              slNo: index + 1,
              ...item,
              date: this.formatDisplayDate(item.date)
            }));

            this.totals['debit'] = this.rows.reduce((sum, r) => sum + r.debit, 0);
            this.totals['credit'] = this.rows.reduce((sum, r) => sum + r.credit, 0);

            this.isLoading = false;
          },
          error: () => {
            this.errorMessage = 'Failed to load journal lines.';
            this.isLoading = false;
          }
        });
      },
      error: () => {
        this.errorMessage = 'Failed to load cash transactions.';
        this.isLoading = false;
      }
    });
  }

  print(): void {
    window.print();
  }

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
}

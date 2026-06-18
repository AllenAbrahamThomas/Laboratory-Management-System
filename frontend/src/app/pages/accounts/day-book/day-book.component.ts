import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountsService, DayBookResponse } from '../../../services/accounts.service';

@Component({
  selector: 'app-day-book',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './day-book.component.html',
  styleUrl: './day-book.component.css'
})
export class DayBookComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly accountsService = inject(AccountsService);

  selectedDate = '';
  dayBook: DayBookResponse | null = null;
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    // Default date to today in YYYY-MM-DD
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    this.selectedDate = localToday.toISOString().split('T')[0];

    this.loadDayBook();
  }

  loadDayBook(): void {
    if (!this.selectedDate) return;
    this.isLoading = true;
    this.errorMessage = '';
    this.accountsService.getDayBook(this.selectedDate).subscribe({
      next: (data) => {
        this.dayBook = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load Day Book entries.';
        this.isLoading = false;
        this.dayBook = null;
      }
    });
  }

  printDayBook(): void {
    if (!this.dayBook) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const receiptsRows = this.dayBook.receipts.map(r => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ccc;">${r.label}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${r.reference || ''}</td>
        <td style="padding: 6px; border: 1px solid #ccc; text-align: right;">${Number(r.amount).toFixed(2)}</td>
      </tr>
    `).join('');
    
    const paymentsRows = this.dayBook.payments.map(p => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ccc;">${p.label}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${p.reference || ''}</td>
        <td style="padding: 6px; border: 1px solid #ccc; text-align: right;">${Number(p.amount).toFixed(2)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Day Book - ${this.dayBook.date}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; font-size: 13px; color: #000; }
            h2, h3 { text-align: center; margin: 5px 0; }
            .header-info { text-align: center; margin-bottom: 20px; font-weight: bold; }
            .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .summary-table th, .summary-table td { border: 1px solid #000; padding: 8px; text-align: left; }
            .summary-table th { background: #f2f2f2; }
            .split-container { display: flex; gap: 20px; }
            .split-side { flex: 1; }
            .side-table { width: 100%; border-collapse: collapse; }
            .side-table th, .side-table td { border: 1px solid #ccc; padding: 6px; text-align: left; font-size: 11px; }
            .side-table th { background: #e6e6e6; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <h2>NEETHI CLINICAL LAB</h2>
          <h3>Daily Day Book Statement</h3>
          <div class="header-info">Date: ${this.dayBook.date}</div>
          
          <table class="summary-table">
            <thead>
              <tr>
                <th>Opening Cash Balance</th>
                <th>Total Daily Cash Receipts</th>
                <th>Total Daily Cash Payments</th>
                <th>Closing Cash Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>INR ${Number(this.dayBook.opening_balance).toFixed(2)}</td>
                <td>INR ${Number(this.dayBook.total_cash_receipts).toFixed(2)}</td>
                <td>INR ${Number(this.dayBook.total_cash_payments).toFixed(2)}</td>
                <td><strong>INR ${Number(this.dayBook.closing_balance).toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
          
          <div class="split-container">
            <div class="split-side">
              <h4>INFLOWS / RECEIPTS</h4>
              <table class="side-table">
                <thead>
                  <tr>
                    <th>Particulars</th>
                    <th>Ref No</th>
                    <th style="text-align: right;">Amount (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  ${receiptsRows || '<tr><td colspan="3" style="text-align:center;">No receipts</td></tr>'}
                </tbody>
              </table>
            </div>
            <div class="split-side">
              <h4>OUTFLOWS / PAYMENTS</h4>
              <table class="side-table">
                <thead>
                  <tr>
                    <th>Particulars</th>
                    <th>Ref No</th>
                    <th style="text-align: right;">Amount (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  ${paymentsRows || '<tr><td colspan="3" style="text-align:center;">No payments</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
}

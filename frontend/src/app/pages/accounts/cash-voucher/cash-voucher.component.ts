import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountsService, AccountHead, CashTransaction } from '../../../services/accounts.service';

@Component({
  selector: 'app-cash-voucher',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-voucher.component.html',
  styleUrl: './cash-voucher.component.css'
})
export class CashVoucherComponent implements OnInit {
  @Input() type: 'payment' | 'receipt' = 'payment';
  @Output() closed = new EventEmitter<void>();

  private readonly accountsService = inject(AccountsService);

  heads: AccountHead[] = [];
  transactions: CashTransaction[] = [];
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Form fields
  voucherNo = '';
  transactionDate = '';
  selectedHeadId: number | null = null;
  amount = 0;
  narration = '';

  ngOnInit(): void {
    // Default date to local today in YYYY-MM-DD
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    this.transactionDate = localToday.toISOString().split('T')[0];

    this.generateVoucherNo();
    this.loadHeads();
    this.loadTransactions();
  }

  generateVoucherNo(): void {
    const prefix = this.type === 'payment' ? 'PV-' : 'RV-';
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.voucherNo = `${prefix}${new Date().getTime().toString().slice(-6)}${rand}`;
  }

  loadHeads(): void {
    this.accountsService.getAccountHeads().subscribe({
      next: (data) => {
        this.heads = data.filter(h => h.is_active);
      }
    });
  }

  loadTransactions(): void {
    this.isLoading = true;
    this.accountsService.getCashTransactions(this.type).subscribe({
      next: (data) => {
        this.transactions = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load transaction history.';
        this.isLoading = false;
      }
    });
  }

  saveVoucher(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.voucherNo.trim()) {
      this.errorMessage = 'Voucher number is required.';
      return;
    }
    if (!this.transactionDate) {
      this.errorMessage = 'Transaction date is required.';
      return;
    }
    if (!this.selectedHeadId) {
      this.errorMessage = 'Please select an Account Head.';
      return;
    }
    if (this.amount <= 0) {
      this.errorMessage = 'Amount must be greater than zero.';
      return;
    }

    const payload: CashTransaction = {
      voucher_no: this.voucherNo.trim(),
      transaction_date: this.transactionDate,
      account_head: this.selectedHeadId,
      amount: this.amount,
      narration: this.narration.trim(),
      tx_type: this.type
    };

    this.isLoading = true;
    this.accountsService.createCashTransaction(payload).subscribe({
      next: () => {
        this.successMessage = `Voucher ${payload.voucher_no} saved successfully.`;
        this.amount = 0;
        this.narration = '';
        this.generateVoucherNo();
        this.loadTransactions();
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || err.error?.voucher_no?.[0] || 'Failed to save voucher.';
        this.isLoading = false;
      }
    });
  }

  printVoucher(tx: CashTransaction): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Cash Voucher ${tx.voucher_no}</title>
          <style>
            body { font-family: monospace; padding: 20px; color: #000; }
            .voucher { border: 2px double #000; padding: 20px; width: 420px; margin: auto; }
            .title { text-align: center; font-weight: bold; font-size: 18px; text-transform: uppercase; margin-bottom: 20px; }
            .row { display: flex; justify-content: space-between; margin: 8px 0; }
            .divider { border-bottom: 1px dashed #000; margin: 15px 0; }
            .amount { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="voucher">
            <div class="title">Cash ${this.type === 'payment' ? 'Payment' : 'Receipt'} Voucher</div>
            <div class="row"><strong>Voucher No:</strong> <span>${tx.voucher_no}</span></div>
            <div class="row"><strong>Date:</strong> <span>${tx.transaction_date}</span></div>
            <div class="divider"></div>
            <div class="row"><strong>Account Head:</strong> <span>${tx.account_head_name}</span></div>
            <div class="row"><strong>Narration:</strong> <span>${tx.narration || '-'}</span></div>
            <div class="divider"></div>
            <div class="row amount"><strong>Amount:</strong> <span>INR ${Number(tx.amount).toFixed(2)}</span></div>
            <br><br>
            <div class="row" style="margin-top: 40px;">
              <span>Prepared By</span>
              <span>Authorized Signatory</span>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
}

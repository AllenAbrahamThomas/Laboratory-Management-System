import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StockService, ReagentItem, StockTransaction } from '../../../services/stock.service';

@Component({
  selector: 'app-stock-transaction',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stock-transaction.component.html',
  styleUrl: './stock-transaction.component.css'
})
export class StockTransactionComponent implements OnInit {
  @Input() mode: 'inward' | 'outward' = 'inward';
  @Output() closed = new EventEmitter<void>();

  private readonly stockService = inject(StockService);

  reagents: ReagentItem[] = [];
  transactions: StockTransaction[] = [];
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Form fields
  selectedReagentId: number | null = null;
  transactionDate = '';
  quantity = 0;
  bottleSize = 0;
  numberOfBottles = 0;
  batchNo = '';
  expiryDate = '';
  unitPrice = 0;
  supplierName = '';
  invoiceNo = '';
  narration = '';
  activeBatches: any[] = [];
  selectedBatchNo: string | null = null;

  ngOnInit(): void {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    this.transactionDate = localToday.toISOString().split('T')[0];

    this.loadReagents();
    this.loadTransactions();
  }

  loadReagents(): void {
    this.stockService.getReagentItems().subscribe({
      next: (data) => {
        this.reagents = data;
      }
    });
  }

  loadTransactions(): void {
    this.isLoading = true;
    this.stockService.getStockTransactions(undefined, this.mode).subscribe({
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

  get selectedReagent(): ReagentItem | undefined {
    return this.reagents.find(r => r.id === this.selectedReagentId);
  }

  getReagentStockLabel(r: ReagentItem): string {
    if (r.reagent_type === 'liquid') {
      const totalVol = (r.quantity_in_stock || 0) * (r.bottle_size || 0);
      const bottlesStr = r.quantity_in_stock === 1 ? 'bottle' : 'bottles';
      return `${r.name} (Stock: ${r.quantity_in_stock} ${bottlesStr} (${totalVol} ml))`;
    }
    return `${r.name} (Stock: ${r.quantity_in_stock} ${r.unit_of_measure})`;
  }

  onReagentChange(): void {
    const reagent = this.selectedReagent;
    this.activeBatches = [];
    this.selectedBatchNo = null;

    if (reagent && reagent.reagent_type === 'liquid') {
      this.bottleSize = reagent.bottle_size || 0;
      this.numberOfBottles = 0;
      this.quantity = 0;
      this.batchNo = '';
      this.expiryDate = '';

      if (this.mode === 'outward' && reagent.id) {
        this.stockService.getReagentBatches(reagent.id).subscribe({
          next: (batches) => {
            this.activeBatches = batches;
          }
        });
      }
    } else {
      this.bottleSize = 0;
      this.numberOfBottles = 0;
      this.quantity = 0;
      this.batchNo = '';
      this.expiryDate = '';
    }
  }

  onBatchChange(): void {
    const selected = this.activeBatches.find(b => b.batch_no === this.selectedBatchNo);
    if (selected) {
      this.batchNo = selected.batch_no;
      this.expiryDate = selected.expiry_date || '';
      this.bottleSize = selected.bottle_size || 0;
    } else {
      this.batchNo = '';
      this.expiryDate = '';
      this.bottleSize = 0;
    }
  }

  saveTransaction(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.selectedReagentId) {
      this.errorMessage = 'Please select a Reagent Item.';
      return;
    }
    if (!this.transactionDate) {
      this.errorMessage = 'Transaction date is required.';
      return;
    }

    if (this.selectedReagent?.reagent_type === 'liquid') {
      this.quantity = this.numberOfBottles;
    }

    if (this.quantity <= 0) {
      this.errorMessage = this.selectedReagent?.reagent_type === 'liquid'
        ? 'Number of bottles must be greater than zero.'
        : 'Quantity must be greater than zero.';
      return;
    }

    if (this.mode === 'outward') {
      const selectedItem = this.selectedReagent;
      if (selectedItem) {
        if (selectedItem.reagent_type === 'liquid') {
          if (!this.selectedBatchNo) {
            this.errorMessage = 'Please select a batch to consume.';
            return;
          }
          const selectedBatch = this.activeBatches.find(b => b.batch_no === this.selectedBatchNo);
          const availStock = selectedBatch ? selectedBatch.unopened_stock : 0;
          if (availStock < this.quantity) {
            const totalVol = availStock * this.bottleSize;
            this.errorMessage = `Insufficient stock in Batch ${this.selectedBatchNo}! Available: ${availStock} bottle${availStock !== 1 ? 's' : ''} (${totalVol} ml).`;
            return;
          }
        } else {
          if ((selectedItem.quantity_in_stock || 0) < this.quantity) {
            this.errorMessage = `Insufficient stock! Current stock is only ${selectedItem.quantity_in_stock} ${selectedItem.unit_of_measure}.`;
            return;
          }
        }
      }
    }

    const payload: StockTransaction = {
      reagent_item: this.selectedReagentId,
      tx_type: this.mode,
      quantity: this.quantity,
      bottle_size: this.selectedReagent?.reagent_type === 'liquid' ? this.bottleSize : undefined,
      batch_no: this.batchNo.trim(),
      expiry_date: this.expiryDate ? this.expiryDate : undefined,
      received_date: this.transactionDate,
      unit_price: this.mode === 'inward' ? this.unitPrice : 0,
      supplier_name: this.mode === 'inward' ? this.supplierName.trim() : '',
      invoice_no: this.mode === 'inward' ? this.invoiceNo.trim() : '',
      narration: this.narration.trim()
    };

    this.isLoading = true;
    this.stockService.createStockTransaction(payload).subscribe({
      next: () => {
        this.successMessage = `Stock transaction logged successfully.`;
        this.quantity = 0;
        this.numberOfBottles = 0;
        this.bottleSize = 0;
        this.batchNo = '';
        this.expiryDate = '';
        this.unitPrice = 0;
        this.supplierName = '';
        this.invoiceNo = '';
        this.narration = '';
        this.selectedBatchNo = null;
        this.activeBatches = [];
        this.loadReagents(); // Reload quantities
        this.loadTransactions();
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || 'Failed to save transaction.';
        this.isLoading = false;
      }
    });
  }

  deleteTransaction(id: number): void {
    if (!confirm('Are you sure you want to delete this stock transaction?')) return;
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.stockService.deleteStockTransaction(id).subscribe({
      next: () => {
        this.successMessage = 'Stock transaction deleted successfully.';
        this.loadReagents();
        this.loadTransactions();
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || 'Failed to delete transaction.';
        this.isLoading = false;
      }
    });
  }
}

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StockService, ReagentItem } from '../../../services/stock.service';

@Component({
  selector: 'app-reagent-items',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reagent-items.component.html',
  styleUrl: './reagent-items.component.css'
})
export class ReagentItemsComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly stockService = inject(StockService);

  reagents: ReagentItem[] = [];
  selectedReagentId: number | null = null;
  isLoading = false;
  errorMessage = '';

  // Form fields
  showForm = false;
  formMode: 'add' | 'edit' = 'add';
  formName = '';
  formCode = '';
  formReagentType: 'liquid' | 'card' | 'other' = 'other';
  formBottleSize: number | null = null;
  formUnit = '';
  formMinLevel = 0;

  // Modal states for Open / Finish bottle
  showOpenBottleModal = false;
  showFinishBottleModal = false;
  openBottleBatches: any[] = [];
  finishBottleBatches: any[] = [];
  selectedOpenBatchNo = '';
  selectedFinishBatchNo = '';

  ngOnInit(): void {
    this.loadReagents();
  }

  loadReagents(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.stockService.getReagentItems().subscribe({
      next: (data) => {
        this.reagents = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load reagents.';
        this.isLoading = false;
      }
    });
  }

  selectReagent(id: number): void {
    this.selectedReagentId = id;
  }

  openAdd(): void {
    this.formMode = 'add';
    this.formName = '';
    this.formCode = '';
    this.formReagentType = 'other';
    this.formBottleSize = null;
    this.formUnit = 'ml';
    this.formMinLevel = 0;
    this.showForm = true;
  }

  openEdit(): void {
    if (this.selectedReagentId === null) return;
    const item = this.reagents.find(r => r.id === this.selectedReagentId);
    if (!item) return;

    this.formMode = 'edit';
    this.formName = item.name;
    this.formCode = item.item_code || '';
    this.formReagentType = item.reagent_type;
    this.formBottleSize = item.bottle_size || null;
    this.formUnit = item.unit_of_measure;
    this.formMinLevel = item.min_stock_level;
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
  }

  saveReagent(): void {
    if (!this.formName.trim()) {
      this.errorMessage = 'Reagent Name is required.';
      return;
    }
    if (!this.formUnit.trim()) {
      this.errorMessage = 'Unit of measure is required.';
      return;
    }

    const payload: ReagentItem = {
      name: this.formName.trim(),
      item_code: this.formCode.trim() || undefined,
      reagent_type: this.formReagentType,
      bottle_size: this.formReagentType === 'liquid' ? (this.formBottleSize || undefined) : undefined,
      unit_of_measure: this.formUnit.trim(),
      min_stock_level: this.formMinLevel
    };

    this.isLoading = true;
    this.errorMessage = '';

    if (this.formMode === 'add') {
      this.stockService.createReagentItem(payload).subscribe({
        next: () => {
          this.loadReagents();
          this.showForm = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.name ? err.error.name[0] : 'Failed to create reagent.';
          this.isLoading = false;
        }
      });
    } else {
      if (this.selectedReagentId === null) return;
      this.stockService.updateReagentItem(this.selectedReagentId, payload).subscribe({
        next: () => {
          this.loadReagents();
          this.showForm = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.name ? err.error.name[0] : 'Failed to update reagent.';
          this.isLoading = false;
        }
      });
    }
  }

  canOpenBottle(): boolean {
    if (this.selectedReagentId === null) return false;
    const item = this.reagents.find(r => r.id === this.selectedReagentId);
    if (!item) return false;
    return item.reagent_type === 'liquid' && (item.quantity_in_stock || 0) > 0;
  }

  canFinishBottle(): boolean {
    if (this.selectedReagentId === null) return false;
    const item = this.reagents.find(r => r.id === this.selectedReagentId);
    if (!item) return false;
    return item.reagent_type === 'liquid' && (item.quantity_in_use || 0) > 0;
  }

  openBottle(): void {
    if (!this.canOpenBottle()) return;
    if (this.selectedReagentId === null) return;
    
    this.isLoading = true;
    this.errorMessage = '';
    this.stockService.getReagentBatches(this.selectedReagentId).subscribe({
      next: (batches) => {
        this.isLoading = false;
        if (batches.length === 0) {
          this.errorMessage = 'No active batches with stock found for this reagent.';
        } else if (batches.length === 1) {
          const batch = batches[0];
          this.postBottleTx('open_bottle', 'Opened bottle for lab use', batch.batch_no, batch.expiry_date);
        } else {
          this.openBottleBatches = batches;
          this.selectedOpenBatchNo = batches[0].batch_no;
          this.showOpenBottleModal = true;
        }
      },
      error: () => {
        this.errorMessage = 'Failed to retrieve batches for reagent.';
        this.isLoading = false;
      }
    });
  }

  confirmOpenBottle(): void {
    if (!this.selectedOpenBatchNo) return;
    const batch = this.openBottleBatches.find(b => b.batch_no === this.selectedOpenBatchNo);
    if (!batch) return;
    
    this.showOpenBottleModal = false;
    this.postBottleTx('open_bottle', 'Opened bottle for lab use', batch.batch_no, batch.expiry_date);
  }

  closeOpenBottleModal(): void {
    this.showOpenBottleModal = false;
  }

  finishBottle(): void {
    if (!this.canFinishBottle()) return;
    if (this.selectedReagentId === null) return;
    
    const item = this.reagents.find(r => r.id === this.selectedReagentId);
    if (!item || !item.active_open_bottles || item.active_open_bottles.length === 0) return;
    
    if (item.active_open_bottles.length === 1) {
      const b = item.active_open_bottles[0];
      this.postBottleTx('discard_in_use', 'Discarded empty bottle', b.batch_no, b.expiry_date);
    } else {
      this.finishBottleBatches = item.active_open_bottles;
      this.selectedFinishBatchNo = item.active_open_bottles[0].batch_no;
      this.showFinishBottleModal = true;
    }
  }

  confirmFinishBottle(): void {
    if (!this.selectedFinishBatchNo) return;
    const batch = this.finishBottleBatches.find(b => b.batch_no === this.selectedFinishBatchNo);
    if (!batch) return;
    
    this.showFinishBottleModal = false;
    this.postBottleTx('discard_in_use', 'Discarded empty bottle', batch.batch_no, batch.expiry_date);
  }

  closeFinishBottleModal(): void {
    this.showFinishBottleModal = false;
  }

  private postBottleTx(txType: 'open_bottle' | 'discard_in_use', narration: string, batchNo?: string, expiryDate?: string): void {
    if (this.selectedReagentId === null) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const item = this.reagents.find(r => r.id === this.selectedReagentId);
    
    this.isLoading = true;
    this.errorMessage = '';
    this.stockService.createStockTransaction({
      reagent_item: this.selectedReagentId,
      tx_type: txType,
      quantity: 1,
      bottle_size: item?.bottle_size,
      batch_no: batchNo || '',
      expiry_date: expiryDate || undefined,
      received_date: todayStr,
      unit_price: 0,
      narration: narration
    }).subscribe({
      next: () => {
        this.loadReagents();
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || 'Failed to record bottle transaction.';
        this.isLoading = false;
      }
    });
  }
}

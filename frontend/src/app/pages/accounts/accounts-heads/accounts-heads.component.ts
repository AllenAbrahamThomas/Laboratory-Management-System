import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountsService, AccountHead } from '../../../services/accounts.service';

@Component({
  selector: 'app-accounts-heads',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accounts-heads.component.html',
  styleUrl: './accounts-heads.component.css'
})
export class AccountsHeadsComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly accountsService = inject(AccountsService);

  heads: AccountHead[] = [];
  selectedHeadId: number | null = null;
  isLoading = false;
  errorMessage = '';

  // Form fields
  showForm = false;
  formMode: 'add' | 'edit' = 'add';
  formName = '';
  formGroup: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' = 'asset';
  formIsActive = true;

  ngOnInit(): void {
    this.loadHeads();
  }

  loadHeads(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.accountsService.getAccountHeads().subscribe({
      next: (data) => {
        this.heads = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load account heads.';
        this.isLoading = false;
      }
    });
  }

  selectHead(id: number): void {
    this.selectedHeadId = id;
  }

  openAdd(): void {
    this.formMode = 'add';
    this.formName = '';
    this.formGroup = 'asset';
    this.formIsActive = true;
    this.showForm = true;
  }

  openEdit(): void {
    if (this.selectedHeadId === null) return;
    const head = this.heads.find(h => h.id === this.selectedHeadId);
    if (!head) return;

    this.formMode = 'edit';
    this.formName = head.name;
    this.formGroup = head.group;
    this.formIsActive = head.is_active;
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
  }

  saveHead(): void {
    if (!this.formName.trim()) {
      this.errorMessage = 'Account Head Name is required.';
      return;
    }

    const payload: AccountHead = {
      name: this.formName.trim(),
      group: this.formGroup,
      is_active: this.formIsActive
    };

    this.isLoading = true;
    this.errorMessage = '';

    if (this.formMode === 'add') {
      this.accountsService.createAccountHead(payload).subscribe({
        next: () => {
          this.loadHeads();
          this.showForm = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.name ? err.error.name[0] : 'Failed to create account head.';
          this.isLoading = false;
        }
      });
    } else {
      if (this.selectedHeadId === null) return;
      this.accountsService.updateAccountHead(this.selectedHeadId, payload).subscribe({
        next: () => {
          this.loadHeads();
          this.showForm = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.name ? err.error.name[0] : 'Failed to update account head.';
          this.isLoading = false;
        }
      });
    }
  }
}

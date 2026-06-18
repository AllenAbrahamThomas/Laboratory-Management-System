import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountsService, AccountHead, JournalEntry, JournalLine } from '../../../services/accounts.service';

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.css'
})
export class JournalComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly accountsService = inject(AccountsService);

  heads: AccountHead[] = [];
  entries: JournalEntry[] = [];
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Form fields
  entryDate = '';
  narration = '';
  lines: JournalLine[] = [];

  ngOnInit(): void {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    this.entryDate = localToday.toISOString().split('T')[0];

    this.loadHeads();
    this.loadEntries();
    this.resetForm();
  }

  resetForm(): void {
    this.narration = '';
    // Start with 2 empty lines
    this.lines = [
      { account_head: null as any, debit: 0, credit: 0 },
      { account_head: null as any, debit: 0, credit: 0 }
    ];
  }

  loadHeads(): void {
    this.accountsService.getAccountHeads().subscribe({
      next: (data) => {
        this.heads = data.filter(h => h.is_active);
      }
    });
  }

  loadEntries(): void {
    this.isLoading = true;
    this.accountsService.getJournalEntries().subscribe({
      next: (data) => {
        this.entries = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load journal history.';
        this.isLoading = false;
      }
    });
  }

  addLine(): void {
    this.lines.push({ account_head: null as any, debit: 0, credit: 0 });
  }

  removeLine(index: number): void {
    if (this.lines.length <= 2) {
      this.errorMessage = 'A journal entry must contain at least 2 lines.';
      return;
    }
    this.lines.splice(index, 1);
  }

  get totalDebit(): number {
    return this.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  }

  get totalCredit(): number {
    return this.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  }

  saveJournal(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.entryDate) {
      this.errorMessage = 'Journal date is required.';
      return;
    }

    const filledLines = this.lines.filter(l => l.account_head);
    if (filledLines.length < 2) {
      this.errorMessage = 'At least two lines with valid Account Heads are required.';
      return;
    }

    // Check for negative values
    for (const line of filledLines) {
      if (line.debit < 0 || line.credit < 0) {
        this.errorMessage = 'Debits and Credits must be non-negative.';
        return;
      }
      if (line.debit > 0 && line.credit > 0) {
        this.errorMessage = 'A single line cannot have both Debit and Credit values.';
        return;
      }
      if (line.debit === 0 && line.credit === 0) {
        this.errorMessage = 'Each line must have either a Debit or a Credit amount.';
        return;
      }
    }

    if (this.totalDebit !== this.totalCredit) {
      this.errorMessage = `Total Debits (INR ${this.totalDebit}) must equal Total Credits (INR ${this.totalCredit}).`;
      return;
    }

    const payload: JournalEntry = {
      entry_date: this.entryDate,
      narration: this.narration.trim(),
      lines: filledLines.map(l => ({
        account_head: Number(l.account_head),
        debit: l.debit,
        credit: l.credit
      }))
    };

    this.isLoading = true;
    this.accountsService.createJournalEntry(payload).subscribe({
      next: () => {
        this.successMessage = 'Journal Entry saved successfully.';
        this.resetForm();
        this.loadEntries();
      },
      error: (err) => {
        this.errorMessage = err.error?.non_field_errors?.[0] || err.error?.detail || 'Failed to save Journal Entry.';
        this.isLoading = false;
      }
    });
  }
}

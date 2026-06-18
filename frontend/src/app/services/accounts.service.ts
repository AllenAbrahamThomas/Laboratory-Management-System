import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface AccountHead {
  id?: number;
  name: string;
  group: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  group_display?: string;
  is_active: boolean;
}

export interface CashTransaction {
  id?: number;
  voucher_no: string;
  transaction_date: string;
  account_head: number;
  account_head_name?: string;
  account_head_group?: string;
  amount: number;
  narration: string;
  tx_type: 'payment' | 'receipt';
}

export interface JournalLine {
  account_head: number;
  account_head_name?: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id?: number;
  entry_date: string;
  narration: string;
  lines: JournalLine[];
}

export interface DayBookItem {
  label: string;
  amount: number;
  source: string;
  reference: string;
}

export interface DayBookResponse {
  date: string;
  opening_balance: number;
  receipts: DayBookItem[];
  payments: DayBookItem[];
  closing_balance: number;
  total_cash_receipts: number;
  total_cash_payments: number;
}

@Injectable({
  providedIn: 'root'
})
export class AccountsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8000/api/heads/';
  private readonly txUrl = 'http://localhost:8000/api/transactions/';
  private readonly journalUrl = 'http://localhost:8000/api/journals/';
  private readonly daybookUrl = 'http://localhost:8000/api/daybook/';

  getAccountHeads(): Observable<AccountHead[]> {
    return this.http.get<AccountHead[]>(this.apiUrl);
  }

  createAccountHead(head: AccountHead): Observable<AccountHead> {
    return this.http.post<AccountHead>(this.apiUrl, head);
  }

  updateAccountHead(id: number, head: AccountHead): Observable<AccountHead> {
    return this.http.put<AccountHead>(`${this.apiUrl}${id}/`, head);
  }

  getCashTransactions(txType?: 'payment' | 'receipt'): Observable<CashTransaction[]> {
    let params = new HttpParams();
    if (txType) {
      params = params.set('tx_type', txType);
    }
    return this.http.get<CashTransaction[]>(this.txUrl, { params });
  }

  createCashTransaction(tx: CashTransaction): Observable<CashTransaction> {
    return this.http.post<CashTransaction>(this.txUrl, tx);
  }

  getJournalEntries(): Observable<JournalEntry[]> {
    return this.http.get<JournalEntry[]>(this.journalUrl);
  }

  createJournalEntry(entry: JournalEntry): Observable<JournalEntry> {
    return this.http.post<JournalEntry>(this.journalUrl, entry);
  }

  getDayBook(date: string): Observable<DayBookResponse> {
    const params = new HttpParams().set('date', date);
    return this.http.get<DayBookResponse>(this.daybookUrl, { params });
  }
}

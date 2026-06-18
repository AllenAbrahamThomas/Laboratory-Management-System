import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ReagentItemActiveOpenBottle {
  batch_no: string;
  expiry_date?: string;
}

export interface ReagentItem {
  id?: number;
  name: string;
  item_code?: string;
  reagent_type: 'liquid' | 'card' | 'other';
  reagent_type_display?: string;
  bottle_size?: number;
  unit_of_measure: string;
  min_stock_level: number;
  quantity_in_stock?: number;
  quantity_in_use?: number;
  active_open_bottles?: ReagentItemActiveOpenBottle[];
  created_at?: string;
  updated_at?: string;
}

export interface StockTransaction {
  id?: number;
  reagent_item: number;
  reagent_item_name?: string;
  reagent_item_unit?: string;
  tx_type: 'inward' | 'outward' | 'open_bottle' | 'discard_in_use';
  quantity: number;
  bottle_size?: number;
  batch_no?: string;
  expiry_date?: string;
  received_date: string;
  unit_price: number;
  supplier_name?: string;
  invoice_no?: string;
  narration?: string;
  test_result?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StockReportAlertItem {
  id: number;
  name?: string;
  reagent_name?: string;
  code?: string;
  quantity: number;
  min_level?: number;
  unit?: string;
  batch_no?: string;
  expiry_date?: string;
  supplier?: string;
  reagent_type?: string;
  bottle_size?: number;
  quantity_in_stock?: number;
  quantity_in_use?: number;
}

export interface StockReportResponse {
  low_stock: StockReportAlertItem[];
  expiring_soon: StockReportAlertItem[];
  expired: StockReportAlertItem[];
  total_items_tracked: number;
}

@Injectable({
  providedIn: 'root'
})
export class StockService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8000/api/reagents/';
  private readonly txUrl = 'http://localhost:8000/api/reagents/transactions/';
  private readonly reportUrl = 'http://localhost:8000/api/reagents/report/';

  getReagentItems(): Observable<ReagentItem[]> {
    return this.http.get<ReagentItem[]>(this.baseUrl);
  }

  createReagentItem(item: ReagentItem): Observable<ReagentItem> {
    return this.http.post<ReagentItem>(this.baseUrl, item);
  }

  updateReagentItem(id: number, item: ReagentItem): Observable<ReagentItem> {
    return this.http.put<ReagentItem>(`${this.baseUrl}${id}/`, item);
  }

  getReagentBatches(id: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}${id}/batches/`);
  }

  getStockTransactions(reagentId?: number, txType?: 'inward' | 'outward' | 'open_bottle' | 'discard_in_use'): Observable<StockTransaction[]> {
    let params = new HttpParams();
    if (reagentId) {
      params = params.set('reagent', reagentId.toString());
    }
    if (txType) {
      params = params.set('tx_type', txType);
    }
    return this.http.get<StockTransaction[]>(this.txUrl, { params });
  }

  createStockTransaction(tx: StockTransaction): Observable<StockTransaction> {
    return this.http.post<StockTransaction>(this.txUrl, tx);
  }

  deleteStockTransaction(id: number): Observable<any> {
    return this.http.delete(`${this.txUrl}${id}/`);
  }

  getStockReport(): Observable<StockReportResponse> {
    return this.http.get<StockReportResponse>(this.reportUrl);
  }
}

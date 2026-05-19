import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface VisitSummary {
  id: number;
  lab_no: string;
  visit_date: string;
  patient: string;
  gender?: string;
  age_years?: number;
  age_months?: number;
  address?: string;
  phone: string;
  doctor: string;
  pay_status: string;
}

export interface VisitListFilters {
  labNo?: string;
  patient?: string;
  phone?: string;
  address?: string;
  matchMode?: 'contains' | 'startswith';
  fromDate?: string;
  toDate?: string;
}

export interface VisitDetailTest {
  id: number;
  test_code: string;
  test_name: string;
  rate: number;
  discount_percent: number;
  amount: number;
  line_order: number;
}

export interface VisitDetail {
  id: number;
  lab_no: string;
  visit_date: string;
  sample_on: string;
  patient_name: string;
  gender: string;
  age_years: number;
  age_months: number;
  phone: string;
  address: string;
  ip_no: string;
  doctor: string;
  out_doctor_name: string;
  hospital: string;
  corporate_name: string;
  pay_mode: string;
  discount_mode: string;
  discount_percent: number;
  discount_reason: string;
  received_amount: number;
  balance_amount: number;
  gross_amount: number;
  round_off: number;
  note: string;
  tests: VisitDetailTest[];
}

@Injectable({
  providedIn: 'root'
})
export class VisitService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8000/api';

  getVisits(filters: VisitListFilters = {}): Observable<VisitSummary[]> {
    let params = new HttpParams();

    if (filters.labNo?.trim()) {
      params = params.set('lab_no', filters.labNo.trim());
    }

    if (filters.patient?.trim()) {
      params = params.set('patient', filters.patient.trim());
    }

    if (filters.phone?.trim()) {
      params = params.set('phone', filters.phone.trim());
    }

    if (filters.address?.trim()) {
      params = params.set('address', filters.address.trim());
    }

    if (filters.matchMode) {
      params = params.set('match_mode', filters.matchMode);
    }

    if (filters.fromDate?.trim()) {
      params = params.set('from_date', filters.fromDate.trim());
    }

    if (filters.toDate?.trim()) {
      params = params.set('to_date', filters.toDate.trim());
    }

    return this.http.get<VisitSummary[]>(`${this.apiUrl}/visits/`, { params });
  }

  getVisitById(visitId: number): Observable<VisitDetail> {
    return this.http.get<VisitDetail>(`${this.apiUrl}/visits/${visitId}/`);
  }
}

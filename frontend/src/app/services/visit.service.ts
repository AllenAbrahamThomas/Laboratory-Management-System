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
  gross_amount?: number;
  received_amount?: number;
  balance_amount?: number;
  created_at?: string;
}

export interface VisitListFilters {
  labNo?: string;
  patient?: string;
  phone?: string;
  address?: string;
  matchMode?: 'contains' | 'startswith';
  pendingOnly?: boolean;
  department?: string;
  splitByDepartment?: boolean;
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

export interface TestLookupItem {
  id: number;
  test_code: string;
  test_name: string;
  short_name: string;
  rate: string | number;
  default_discount_percent: string | number;
  default_amount: string | number;
  department: string;
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

export interface VisitSavePayload {
  lab_no: string;
  patient_name: string;
  gender: string;
  age_years: number;
  age_months: number;
  phone: string;
  address: string;
  sample_on: string;
  ip_no: string;
  out_doctor_name: string;
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
}

export interface NextLabNoResponse {
  lab_no: string;
}

export interface ResultEntryGroupChild {
  test_id: number;
  test_name: string;
  unit: string;
  reference_range: string;
  result_value: string;
  note: string;
}

export interface ResultEntryTest {
  visit_test_id: number;
  test_id: number;
  test_name: string;
  type: 'general' | 'group';
  unit?: string;
  reference_range?: string;
  result_value?: string;
  note?: string;
  children?: ResultEntryGroupChild[];
}

export interface ResultEntryPayload {
  visit_id: number;
  lab_no: string;
  date: string;
  pay_mode: string;
  patient_name: string;
  gender: string;
  age_years: number;
  age_months: number;
  phone: string;
  address: string;
  doctor: string;
  out_doctor_name: string;
  hospital: string;
  tests: ResultEntryTest[];
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

    if (filters.pendingOnly) {
      params = params.set('pending_only', '1');
    }

    if (filters.department?.trim()) {
      params = params.set('department', filters.department.trim());
    }

    if (filters.splitByDepartment) {
      params = params.set('split_by_department', '1');
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

  getVisitByLabNo(labNo: string): Observable<VisitDetail> {
    return this.http.get<VisitDetail>(`${this.apiUrl}/visits/lab/${encodeURIComponent(labNo)}/`);
  }

  getNextLabNo(): Observable<NextLabNoResponse> {
    return this.http.get<NextLabNoResponse>(`${this.apiUrl}/visits/next-lab-no/`);
  }

  createVisit(payload: VisitSavePayload): Observable<VisitDetail> {
    return this.http.post<VisitDetail>(`${this.apiUrl}/visits/create/`, payload);
  }

  updateVisit(visitId: number, payload: VisitSavePayload): Observable<VisitDetail> {
    return this.http.put<VisitDetail>(`${this.apiUrl}/visits/${visitId}/update/`, payload);
  }

  getTests(query: string): Observable<TestLookupItem[]> {
    const params = query.trim()
      ? new HttpParams().set('q', query.trim())
      : new HttpParams();
    return this.http.get<TestLookupItem[]>(`${this.apiUrl}/tests/`, { params });
  }

  getResultEntryByVisit(visitId: number): Observable<ResultEntryPayload> {
    return this.http.get<ResultEntryPayload>(`${this.apiUrl}/result-entry/visit/${visitId}/`);
  }

  getResultEntryByLabNo(labNo: string): Observable<ResultEntryPayload> {
    return this.http.get<ResultEntryPayload>(`${this.apiUrl}/result-entry/lab/${encodeURIComponent(labNo)}/`);
  }

  saveResultEntry(visitId: number, entries: Array<{ visit_test_id: number; test_id: number; result_value: string; note: string }>): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.apiUrl}/result-entry/visit/${visitId}/save/`, { entries });
  }
}


import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Doctor {
  id?: number;
  doctor_code?: string;
  name: string;
  phone?: string;
  address?: string;
  is_active: boolean;
}

export interface Hospital {
  id?: number;
  hospital_code?: string;
  name: string;
  phone?: string;
  address?: string;
  is_active: boolean;
}

export interface Patient {
  id?: number;
  patient_code?: string;
  full_name: string;
  gender: 'male' | 'female' | 'other';
  gender_display?: string;
  age_years: number;
  age_months: number;
  phone?: string;
  address?: string;
}

export interface Department {
  id?: number;
  department_code: string;
  name: string;
  report_order: number;
  is_active: boolean;
}

export interface Unit {
  id?: number;
  name: string;
  is_active: boolean;
}

export interface Test {
  id?: number;
  test_code: string;
  test_name: string;
  short_name?: string;
  department: number;
  department_name?: string;
  rate: number | string;
  default_discount_percent: number | string;
  default_amount: number | string;
  unit?: string;
  result_type: 'numeric' | 'text' | 'choice' | 'panel';
  is_group: boolean;
  is_active: boolean;
  reagent_item?: number;
  reagent_quantity?: number | string;
  reagent_auto_reduce?: boolean;
  technology?: number;
  technology_name?: string;
}

export interface Method {
  id?: number;
  name: string;
  is_active: boolean;
}

export interface Technology {
  id?: number;
  name: string;
  is_active: boolean;
}

export interface DiscountReason {
  id?: number;
  reason_text: string;
  is_active: boolean;
}

export interface SMSTemplate {
  id?: number;
  event_name: 'registration' | 'result_ready' | 'balance_due';
  event_name_display?: string;
  template_text: string;
}

export interface LabCustomization {
  id?: number;
  section: string;
  key: string;
  value: string;
}

export interface TestReferenceRange {
  id?: number;
  test: number;
  gender: 'any' | 'male' | 'female';
  gender_display?: string;
  operator: 'between' | 'lt' | 'lte' | 'gt' | 'gte' | 'text';
  min_value?: number | string;
  max_value?: number | string;
  display_text: string;
  unit?: string;
  is_active: boolean;
}

export interface TestGroupItem {
  id?: number;
  parent_test: number;
  child_test: number;
  line_order: number;
  child_test_name?: string;
  child_test_code?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8000/api';

  // Generic helpers
  private getList<T>(endpoint: string, params?: HttpParams): Observable<T[]> {
    return this.http.get<T[]>(`${this.apiUrl}/${endpoint}/`, { params });
  }

  private getDetail<T>(endpoint: string, id: number): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${endpoint}/${id}/`);
  }

  private createRecord<T>(endpoint: string, payload: any): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${endpoint}/`, payload);
  }

  private updateRecord<T>(endpoint: string, id: number, payload: any): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}/${endpoint}/${id}/`, payload);
  }

  private deleteRecord(endpoint: string, id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${endpoint}/${id}/`);
  }

  // Doctor CRUD
  getDoctors(): Observable<Doctor[]> { return this.getList<Doctor>('doctors'); }
  getDoctor(id: number): Observable<Doctor> { return this.getDetail<Doctor>('doctors', id); }
  createDoctor(data: Doctor): Observable<Doctor> { return this.createRecord<Doctor>('doctors', data); }
  updateDoctor(id: number, data: Doctor): Observable<Doctor> { return this.updateRecord<Doctor>('doctors', id, data); }
  deleteDoctor(id: number): Observable<void> { return this.deleteRecord('doctors', id); }

  // Hospital CRUD
  getHospitals(): Observable<Hospital[]> { return this.getList<Hospital>('hospitals'); }
  getHospital(id: number): Observable<Hospital> { return this.getDetail<Hospital>('hospitals', id); }
  createHospital(data: Hospital): Observable<Hospital> { return this.createRecord<Hospital>('hospitals', data); }
  updateHospital(id: number, data: Hospital): Observable<Hospital> { return this.updateRecord<Hospital>('hospitals', id, data); }
  deleteHospital(id: number): Observable<void> { return this.deleteRecord('hospitals', id); }

  // Patient CRUD
  getPatients(): Observable<Patient[]> { return this.getList<Patient>('patients'); }
  getPatient(id: number): Observable<Patient> { return this.getDetail<Patient>('patients', id); }
  createPatient(data: Patient): Observable<Patient> { return this.createRecord<Patient>('patients', data); }
  updatePatient(id: number, data: Patient): Observable<Patient> { return this.updateRecord<Patient>('patients', id, data); }
  deletePatient(id: number): Observable<void> { return this.deleteRecord('patients', id); }

  // Department CRUD
  getDepartments(): Observable<Department[]> { return this.getList<Department>('departments'); }
  getDepartment(id: number): Observable<Department> { return this.getDetail<Department>('departments', id); }
  createDepartment(data: Department): Observable<Department> { return this.createRecord<Department>('departments', data); }
  updateDepartment(id: number, data: Department): Observable<Department> { return this.updateRecord<Department>('departments', id, data); }
  deleteDepartment(id: number): Observable<void> { return this.deleteRecord('departments', id); }

  // Unit CRUD
  getUnits(): Observable<Unit[]> { return this.getList<Unit>('units'); }
  getUnit(id: number): Observable<Unit> { return this.getDetail<Unit>('units', id); }
  createUnit(data: Unit): Observable<Unit> { return this.createRecord<Unit>('units', data); }
  updateUnit(id: number, data: Unit): Observable<Unit> { return this.updateRecord<Unit>('units', id, data); }
  deleteUnit(id: number): Observable<void> { return this.deleteRecord('units', id); }

  // Test CRUD
  getTests(): Observable<Test[]> { return this.getList<Test>('tests-detailed'); }
  getTest(id: number): Observable<Test> { return this.getDetail<Test>('tests-detailed', id); }
  createTest(data: Test): Observable<Test> { return this.createRecord<Test>('tests-detailed', data); }
  updateTest(id: number, data: Test): Observable<Test> { return this.updateRecord<Test>('tests-detailed', id, data); }
  deleteTest(id: number): Observable<void> { return this.deleteRecord('tests-detailed', id); }
  getNextTestCode(): Observable<{ test_code: string }> {
    return this.http.get<{ test_code: string }>(`${this.apiUrl}/tests/next-code/`);
  }

  // Method CRUD
  getMethods(): Observable<Method[]> { return this.getList<Method>('methods'); }
  createMethod(data: Method): Observable<Method> { return this.createRecord<Method>('methods', data); }
  updateMethod(id: number, data: Method): Observable<Method> { return this.updateRecord<Method>('methods', id, data); }
  deleteMethod(id: number): Observable<void> { return this.deleteRecord('methods', id); }

  // Technology CRUD
  getTechnologies(): Observable<Technology[]> { return this.getList<Technology>('technologies'); }
  createTechnology(data: Technology): Observable<Technology> { return this.createRecord<Technology>('technologies', data); }
  updateTechnology(id: number, data: Technology): Observable<Technology> { return this.updateRecord<Technology>('technologies', id, data); }
  deleteTechnology(id: number): Observable<void> { return this.deleteRecord('technologies', id); }

  // DiscountReason CRUD
  getDiscountReasons(): Observable<DiscountReason[]> { return this.getList<DiscountReason>('discount-reasons'); }
  createDiscountReason(data: DiscountReason): Observable<DiscountReason> { return this.createRecord<DiscountReason>('discount-reasons', data); }
  updateDiscountReason(id: number, data: DiscountReason): Observable<DiscountReason> { return this.updateRecord<DiscountReason>('discount-reasons', id, data); }
  deleteDiscountReason(id: number): Observable<void> { return this.deleteRecord('discount-reasons', id); }

  // SMSTemplate CRUD
  getSMSTemplates(): Observable<SMSTemplate[]> { return this.getList<SMSTemplate>('sms-templates'); }
  createSMSTemplate(data: SMSTemplate): Observable<SMSTemplate> { return this.createRecord<SMSTemplate>('sms-templates', data); }
  updateSMSTemplate(id: number, data: SMSTemplate): Observable<SMSTemplate> { return this.updateRecord<SMSTemplate>('sms-templates', id, data); }
  deleteSMSTemplate(id: number): Observable<void> { return this.deleteRecord('sms-templates', id); }

  // Customization CRUD
  getCustomizations(): Observable<LabCustomization[]> { return this.getList<LabCustomization>('lab-customizations'); }
  createCustomization(data: LabCustomization): Observable<LabCustomization> { return this.createRecord<LabCustomization>('lab-customizations', data); }
  updateCustomization(id: number, data: LabCustomization): Observable<LabCustomization> { return this.updateRecord<LabCustomization>('lab-customizations', id, data); }
  deleteCustomization(id: number): Observable<void> { return this.deleteRecord('lab-customizations', id); }

  // TestReferenceRange CRUD
  getTestReferenceRanges(testId: number): Observable<TestReferenceRange[]> {
    const params = new HttpParams().set('test', testId.toString());
    return this.getList<TestReferenceRange>('test-reference-ranges', params);
  }
  createTestReferenceRange(data: TestReferenceRange): Observable<TestReferenceRange> {
    return this.createRecord<TestReferenceRange>('test-reference-ranges', data);
  }
  updateTestReferenceRange(id: number, data: TestReferenceRange): Observable<TestReferenceRange> {
    return this.updateRecord<TestReferenceRange>('test-reference-ranges', id, data);
  }
  deleteTestReferenceRange(id: number): Observable<void> {
    return this.deleteRecord('test-reference-ranges', id);
  }

  // TestGroupItem CRUD
  getTestGroupItems(parentTestId?: number): Observable<TestGroupItem[]> {
    let params = new HttpParams();
    if (parentTestId) {
      params = params.set('parent_test', parentTestId.toString());
    }
    return this.getList<TestGroupItem>('test-group-items', params);
  }
  createTestGroupItem(data: TestGroupItem): Observable<TestGroupItem> {
    return this.createRecord<TestGroupItem>('test-group-items', data);
  }
  updateTestGroupItem(id: number, data: TestGroupItem): Observable<TestGroupItem> {
    return this.updateRecord<TestGroupItem>('test-group-items', id, data);
  }
  deleteTestGroupItem(id: number): Observable<void> {
    return this.deleteRecord('test-group-items', id);
  }
}

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface PatientSearchResult {
  invoiceNo: string;
  date: string;
  patient: string;
  gender: string;
  age: string;
  ageGroup: string;
  address: string;
  phone: string;
  email: string;
  invoicedBy: string;
  year: string;
}

@Component({
  selector: 'app-patient-advance-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-advance-search.component.html',
  styleUrl: './patient-advance-search.component.css'
})
export class PatientAdvanceSearchComponent {
  @Output() closed = new EventEmitter<void>();

  searchBy: 'phone' | 'patient' | 'address' = 'phone';
  openType: 'newBill' | 'existingBill' | 'patientResult' = 'newBill';
  hasPhoneWord = false;
  hasPatientWord = false;
  hasAddressWord = false;
  phoneQuery = '';
  patientQuery = '';
  addressQuery = '';

  readonly results: PatientSearchResult[] = [];

  search(): void {
    // Backend-backed search can plug in here. The UI is ready and currently starts empty.
  }
}

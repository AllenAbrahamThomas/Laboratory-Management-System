import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VisitService } from '../../services/visit.service';

interface PatientSearchResult {
  id: number;
  invoiceNo: string;
  date: string;
  patient: string;
  gender: string;
  age: string;
  address: string;
  phone: string;
  invoicedBy: string;
  visitsCount: number;
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
  @Output() openRequested = new EventEmitter<{ visitId: number; openType: 'newBill' | 'existingBill' | 'patientResult' }>();

  private readonly visitService = inject(VisitService);

  searchBy: 'phone' | 'patient' | 'address' = 'phone';
  openType: 'newBill' | 'existingBill' | 'patientResult' = 'newBill';
  hasPhoneWord = false;
  hasPatientWord = false;
  hasAddressWord = false;
  phoneQuery = '';
  patientQuery = '';
  addressQuery = '';
  isLoading = false;
  errorMessage = '';
  selectedVisitId: number | null = null;

  results: PatientSearchResult[] = [];

  search(): void {
    const query = this.getActiveQuery();
    this.isLoading = true;
    this.errorMessage = '';
    this.selectedVisitId = null;

    this.visitService.getVisits({
      patient: this.searchBy === 'patient' ? query : undefined,
      phone: this.searchBy === 'phone' ? query : undefined,
      address: this.searchBy === 'address' ? query : undefined,
      matchMode: this.isHasWordEnabled() ? 'contains' : 'startswith'
    }).subscribe({
      next: (visits) => {
        const keyCountMap = new Map<string, number>();
        for (const visit of visits) {
          const key = `${(visit.patient || '').toLowerCase()}|${(visit.phone || '').toLowerCase()}`;
          keyCountMap.set(key, (keyCountMap.get(key) || 0) + 1);
        }

        this.results = visits.map((visit) => {
          const key = `${(visit.patient || '').toLowerCase()}|${(visit.phone || '').toLowerCase()}`;
          return {
            id: visit.id,
            invoiceNo: visit.lab_no,
            date: this.formatDisplayDate(visit.visit_date),
            patient: visit.patient,
            gender: visit.gender || '',
            age: String(visit.age_years ?? ''),
            address: visit.address || '',
            phone: visit.phone,
            invoicedBy: visit.doctor,
            visitsCount: keyCountMap.get(key) || 1,
          };
        });

        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.results = [];
        this.errorMessage = error.status === 0
          ? 'Unable to reach backend.'
          : 'Unable to search visits.';
        this.isLoading = false;
      }
    });
  }

  selectVisit(visitId: number): void {
    this.selectedVisitId = visitId;
  }

  openSelected(): void {
    if (this.selectedVisitId === null) {
      return;
    }

    this.openRequested.emit({
      visitId: this.selectedVisitId,
      openType: this.openType
    });
  }

  getIsActiveSearch(searchField: 'phone' | 'patient' | 'address'): boolean {
    return this.searchBy === searchField;
  }

  private getActiveQuery(): string {
    if (this.searchBy === 'phone') {
      return this.phoneQuery.trim();
    }
    if (this.searchBy === 'patient') {
      return this.patientQuery.trim();
    }
    return this.addressQuery.trim();
  }

  private isHasWordEnabled(): boolean {
    if (this.searchBy === 'phone') {
      return this.hasPhoneWord;
    }
    if (this.searchBy === 'patient') {
      return this.hasPatientWord;
    }
    return this.hasAddressWord;
  }

  private formatDisplayDate(dateValue: string): string {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
}

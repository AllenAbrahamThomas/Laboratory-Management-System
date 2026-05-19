import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VisitService } from '../../../services/visit.service';

interface PatientSummary {
  id: number;
  labNo: string;
  date: string;
  patient: string;
  phone: string;
  doctor: string;
  payStatus: string;
}

@Component({
  selector: 'app-patient-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-list.component.html',
  styleUrl: './patient-list.component.css'
})
export class PatientListComponent implements OnInit {
  @Output() newRegistration = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() patientSelected = new EventEmitter<number>();

  private readonly visitService = inject(VisitService);

  labNoSearch = '';
  patientSearch = '';
  fromDate = this.getTodayDate();
  toDate = this.getTodayDate();
  isLoading = false;
  errorMessage = '';

  patients: PatientSummary[] = [];

  ngOnInit(): void {
    this.loadPatients();
  }

  loadPatients(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.visitService.getVisits({
      labNo: this.labNoSearch,
      patient: this.patientSearch,
      fromDate: this.fromDate,
      toDate: this.toDate,
    }).subscribe({
      next: (visits) => {
        this.patients = visits.map((visit) => ({
          id: visit.id,
          labNo: visit.lab_no,
          date: this.formatDisplayDate(visit.visit_date),
          patient: visit.patient,
          phone: visit.phone,
          doctor: visit.doctor,
          payStatus: visit.pay_status,
        }));
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.patients = [];
        this.errorMessage = error.status === 0
          ? 'Unable to reach backend.'
          : 'Unable to load patient list.';
        this.isLoading = false;
      }
    });
  }

  openPatientBill(patient: PatientSummary): void {
    this.patientSelected.emit(patient.id);
  }

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

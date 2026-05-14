import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface PatientSummary {
  labNo: string;
  date: string;
  dateIso: string;
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
export class PatientListComponent {
  @Output() newRegistration = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  labNoSearch = '';
  patientSearch = '';
  fromDate = this.getTodayDate();
  toDate = this.getTodayDate();

  readonly patients: PatientSummary[] = [];

  get filteredPatients(): PatientSummary[] {
    const labNo = this.labNoSearch.trim();
    const patient = this.patientSearch.trim().toLowerCase();
    const fromTime = this.getDateTime(this.fromDate);
    const toTime = this.getDateTime(this.toDate);

    return this.patients.filter((entry) => {
      const entryTime = this.getDateTime(entry.dateIso);
      const matchesLabNo = !labNo || entry.labNo.includes(labNo);
      const matchesPatient = !patient || entry.patient.toLowerCase().includes(patient);
      const matchesFrom = fromTime === null || entryTime === null || entryTime >= fromTime;
      const matchesTo = toTime === null || entryTime === null || entryTime <= toTime;

      return matchesLabNo && matchesPatient && matchesFrom && matchesTo;
    });
  }

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDateTime(dateValue: string): number | null {
    if (!dateValue) {
      return null;
    }

    const time = new Date(dateValue).getTime();
    return Number.isNaN(time) ? null : time;
  }
}

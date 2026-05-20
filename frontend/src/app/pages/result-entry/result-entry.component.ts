import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ResultEntryPayload, ResultEntryTest, VisitService } from '../../services/visit.service';

@Component({
  selector: 'app-result-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './result-entry.component.html',
  styleUrl: './result-entry.component.css'
})
export class ResultEntryComponent implements OnChanges {
  @Input() selectedVisitId: number | null = null;
  @Output() closed = new EventEmitter<void>();

  private readonly visitService = inject(VisitService);

  labNoSearch = '';
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  infoMessage = '';

  resultData: ResultEntryPayload | null = null;
  selectedTest: ResultEntryTest | null = null;
  showPreview = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedVisitId'] && this.selectedVisitId) {
      this.loadByVisitId(this.selectedVisitId);
    }
  }

  loadByLabNo(): void {
    const labNo = this.labNoSearch.trim();
    if (!labNo) {
      this.errorMessage = 'Enter Lab No.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.visitService.getResultEntryByLabNo(labNo).subscribe({
      next: (data) => {
        this.resultData = data;
        this.selectedTest = data.tests[0] || null;
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.resultData = null;
        this.selectedTest = null;
        this.errorMessage = error.status === 404 ? 'Lab No not found.' : 'Unable to load result entry.';
        this.isLoading = false;
      }
    });
  }

  selectTest(test: ResultEntryTest): void {
    this.selectedTest = test;
  }

  saveResults(): void {
    if (!this.resultData) {
      return;
    }

    const entries: Array<{ visit_test_id: number; test_id: number; result_value: string; note: string }> = [];

    for (const test of this.resultData.tests) {
      if (test.type === 'group' && test.children) {
        for (const child of test.children) {
          entries.push({
            visit_test_id: test.visit_test_id,
            test_id: child.test_id,
            result_value: child.result_value || '',
            note: child.note || '',
          });
        }
      } else {
        entries.push({
          visit_test_id: test.visit_test_id,
          test_id: test.test_id,
          result_value: test.result_value || '',
          note: test.note || '',
        });
      }
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.infoMessage = '';
    this.visitService.saveResultEntry(this.resultData.visit_id, entries).subscribe({
      next: () => {
        this.infoMessage = 'Result saved.';
        this.isSaving = false;
      },
      error: () => {
        this.errorMessage = 'Unable to save result.';
        this.isSaving = false;
      }
    });
  }

  openPrintPreview(): void {
    this.showPreview = true;
  }

  closePrintPreview(): void {
    this.showPreview = false;
  }

  private loadByVisitId(visitId: number): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.visitService.getResultEntryByVisit(visitId).subscribe({
      next: (data) => {
        this.resultData = data;
        this.labNoSearch = data.lab_no;
        this.selectedTest = data.tests[0] || null;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Unable to load result entry.';
        this.isLoading = false;
      }
    });
  }
}

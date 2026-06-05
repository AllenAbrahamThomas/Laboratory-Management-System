import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ClockService } from '../../services/clock.service';
import { ResultEntryPayload, ResultEntryTest, VisitService } from '../../services/visit.service';

interface ResultEntryDisplayChild {
  test_id: number;
  test_name: string;
  unit?: string;
  reference_range?: string;
  result_value?: string;
  note?: string;
  isIssued: boolean;
  printEnabled: boolean;
}

type ResultEntryDisplayTest = Omit<ResultEntryTest, 'children'> & {
  isIssued: boolean;
  printEnabled: boolean;
  children?: ResultEntryDisplayChild[];
};

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

  private readonly clockService = inject(ClockService);
  private readonly visitService = inject(VisitService);
  private readonly destroyRef = inject(DestroyRef);

  labNoSearch = '';
  currentTime = new Date();
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  infoMessage = '';

  resultData: ResultEntryPayload | null = null;
  resultTests: ResultEntryDisplayTest[] = [];
  selectedTest: ResultEntryDisplayTest | null = null;
  showPreview = false;

  constructor() {
    this.clockService.currentTime$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((currentTime) => {
        this.currentTime = currentTime;
      });
  }

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
        this.bindResultData(data);
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

  selectTest(test: ResultEntryDisplayTest): void {
    this.selectedTest = test;
  }

  selectPreviousTest(): void {
    if (!this.selectedTest || this.resultTests.length === 0) {
      return;
    }

    const currentIndex = this.resultTests.findIndex((item) => item.visit_test_id === this.selectedTest?.visit_test_id);
    if (currentIndex <= 0) {
      return;
    }

    this.selectedTest = this.resultTests[currentIndex - 1];
  }

  selectNextTest(): void {
    if (!this.selectedTest || this.resultTests.length === 0) {
      return;
    }

    const currentIndex = this.resultTests.findIndex((item) => item.visit_test_id === this.selectedTest?.visit_test_id);
    if (currentIndex === -1 || currentIndex >= this.resultTests.length - 1) {
      return;
    }

    this.selectedTest = this.resultTests[currentIndex + 1];
  }

  saveResults(): void {
    if (!this.resultData) {
      return;
    }

    const entries: Array<{ visit_test_id: number; test_id: number; result_value: string; note: string }> = [];

    for (const test of this.resultTests) {
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
        this.bindResultData(data);
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Unable to load result entry.';
        this.isLoading = false;
      }
    });
  }

  private bindResultData(data: ResultEntryPayload): void {
    this.resultData = data;
    this.labNoSearch = data.lab_no;
    this.resultTests = data.tests.map((test) => ({
      ...test,
      isIssued: true,
      printEnabled: true,
      children: test.children?.map((child) => ({
        ...child,
        isIssued: true,
        printEnabled: true,
      }))
    }));
    this.selectedTest = this.resultTests[0] || null;
    this.showPreview = false;
  }
}

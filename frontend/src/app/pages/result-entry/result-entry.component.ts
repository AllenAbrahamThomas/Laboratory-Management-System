import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ClockService } from '../../services/clock.service';
import { LabPrintConfig, ResultEntryPayload, ResultEntryTest, VisitService } from '../../services/visit.service';
import { AuthService } from '../../services/auth.service';

interface ResultEntryDisplayChild {
  test_id: number;
  test_name: string;
  unit?: string;
  reference_range?: string;
  result_value?: string;
  note?: string;
  isIssued: boolean;
  printEnabled: boolean;
  test_code?: string;
  short_name?: string;
  formula?: string;
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
  readonly authService = inject(AuthService);

  labNoSearch = '';
  currentTime = new Date();
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  infoMessage = '';
  showEntryDialog = false;
  entryDialogMode: 'general' | 'group' = 'general';
  showPrintPreview = false;
  labPrintConfig: LabPrintConfig | null = null;
  isLoadingLabPrintConfig = false;

  resultData: ResultEntryPayload | null = null;
  resultTests: ResultEntryDisplayTest[] = [];
  selectedTest: ResultEntryDisplayTest | null = null;
  dialogGeneralTests: ResultEntryDisplayTest[] = [];
  dialogGroupChildren: ResultEntryDisplayChild[] = [];
  showPreview = false;

  constructor() {
    this.clockService.currentTime$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((currentTime) => {
        this.currentTime = currentTime;
      });

    this.loadLabPrintConfig();
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
    this.openEntryDialog(test);
  }

  selectPreviousTest(): void {
    if (!this.selectedTest || this.resultTests.length === 0) {
      return;
    }

    const currentIndex = this.resultTests.findIndex((item) => item.visit_test_id === this.selectedTest?.visit_test_id);
    if (currentIndex <= 0) {
      return;
    }

    this.openEntryDialog(this.resultTests[currentIndex - 1]);
  }

  selectNextTest(): void {
    if (!this.selectedTest || this.resultTests.length === 0) {
      return;
    }

    const currentIndex = this.resultTests.findIndex((item) => item.visit_test_id === this.selectedTest?.visit_test_id);
    if (currentIndex === -1 || currentIndex >= this.resultTests.length - 1) {
      return;
    }

    this.openEntryDialog(this.resultTests[currentIndex + 1]);
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
        this.openPrintPreview();
      },
      error: () => {
        this.errorMessage = 'Unable to save result.';
        this.isSaving = false;
      }
    });
  }

  openPrintPreview(): void {
    if (!this.labPrintConfig) {
      this.loadLabPrintConfig();
    }
    this.showEntryDialog = false;
    this.showPrintPreview = true;
  }

  closePrintPreview(): void {
    this.showPrintPreview = false;
  }

  printResultPreview(): void {
    window.print();
  }

  closeEntryDialog(): void {
    this.showEntryDialog = false;
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
    this.calculateFormulas();
    this.selectedTest = this.resultTests[0] || null;
    this.showEntryDialog = false;
    this.dialogGeneralTests = [];
    this.dialogGroupChildren = [];
    this.showPrintPreview = false;
  }

  private openEntryDialog(test: ResultEntryDisplayTest): void {
    this.selectedTest = test;
    this.showEntryDialog = true;
    this.entryDialogMode = test.type === 'group' ? 'group' : 'general';

    if (this.entryDialogMode === 'group') {
      this.dialogGroupChildren = test.children || [];
      this.dialogGeneralTests = [];
      return;
    }

    this.dialogGeneralTests = this.resultTests.filter((item) => item.type === 'general');
    this.dialogGroupChildren = [];
  }

  private loadLabPrintConfig(): void {
    this.isLoadingLabPrintConfig = true;
    this.visitService.getLabPrintConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (config) => {
        this.labPrintConfig = config;
        this.isLoadingLabPrintConfig = false;
      },
      error: () => {
        this.labPrintConfig = null;
        this.isLoadingLabPrintConfig = false;
      }
    });
  }

  getPrintableResultRows(): Array<{ type: 'department' | 'group-header' | 'general'; displayNo: number | null; name: string; result: string; reference: string; unit: string; }> {
    const rows: Array<{ type: 'department' | 'group-header' | 'general'; displayNo: number | null; name: string; result: string; reference: string; unit: string; }> = [];

    // 1. Group tests by department (filtering out tests/children without results)
    const groupsMap = new Map<string, { order: number; tests: ResultEntryDisplayTest[] }>();

    for (const test of this.resultTests) {
      if (!test.printEnabled) {
        continue;
      }

      if (test.type === 'group') {
        const activeChildren = (test.children || []).filter(
          (child) => child.result_value !== undefined && child.result_value.trim() !== ''
        );

        if (activeChildren.length === 0) {
          continue; // skip empty group test
        }

        const testCopy = {
          ...test,
          children: activeChildren
        };

        const deptName = test.department_name || 'GENERAL';
        const deptOrder = test.department_order !== undefined ? test.department_order : 9999;

        if (!groupsMap.has(deptName)) {
          groupsMap.set(deptName, { order: deptOrder, tests: [] });
        }
        groupsMap.get(deptName)!.tests.push(testCopy);
      } else {
        const hasResult = test.result_value !== undefined && test.result_value.trim() !== '';
        if (!hasResult) {
          continue; // skip empty general test
        }

        const deptName = test.department_name || 'GENERAL';
        const deptOrder = test.department_order !== undefined ? test.department_order : 9999;

        if (!groupsMap.has(deptName)) {
          groupsMap.set(deptName, { order: deptOrder, tests: [] });
        }
        groupsMap.get(deptName)!.tests.push(test);
      }
    }

    // 2. Sort departments by order, then by name
    const sortedDeptNames = Array.from(groupsMap.keys()).sort((a, b) => {
      const groupA = groupsMap.get(a)!;
      const groupB = groupsMap.get(b)!;
      if (groupA.order !== groupB.order) {
        return groupA.order - groupB.order;
      }
      return a.localeCompare(b);
    });

    // 3. Build rows
    let displayNo = 0;
    for (const deptName of sortedDeptNames) {
      const dept = groupsMap.get(deptName)!;

      // Add department header
      rows.push({
        type: 'department',
        displayNo: null,
        name: deptName,
        result: '',
        reference: '',
        unit: ''
      });

      for (const test of dept.tests) {
        if (test.type === 'group') {
          // Add group header
          rows.push({
            type: 'group-header',
            displayNo: null,
            name: test.test_name,
            result: '',
            reference: '',
            unit: ''
          });

          for (const child of test.children || []) {
            displayNo += 1;
            rows.push({
              type: 'general',
              displayNo,
              name: `  ${child.test_name}`,
              result: child.result_value || '',
              reference: child.reference_range || '',
              unit: child.unit || ''
            });
          }
        } else {
          displayNo += 1;
          rows.push({
            type: 'general',
            displayNo,
            name: test.test_name,
            result: test.result_value || '',
            reference: test.reference_range || '',
            unit: test.unit || ''
          });
        }
      }
    }

    return rows;
  }

  onResultValueChange(): void {
    this.calculateFormulas();
  }

  calculateFormulas(): void {
    const valuesMap = new Map<string, number>();

    const getCleanNumericValue = (val: string | undefined | null): number | null => {
      if (val === undefined || val === null) return null;
      const trimmed = val.trim();
      if (!trimmed) return null;
      const parsed = parseFloat(trimmed);
      return isNaN(parsed) ? null : parsed;
    };

    // Populate lookup map
    for (const test of this.resultTests) {
      if (test.type === 'group' && test.children) {
        for (const child of test.children) {
          const val = getCleanNumericValue(child.result_value);
          if (val !== null) {
            if (child.test_code) {
              valuesMap.set(child.test_code.toUpperCase(), val);
            }
            if (child.short_name) {
              valuesMap.set(child.short_name.toUpperCase(), val);
            }
          }
        }
      } else {
        const val = getCleanNumericValue(test.result_value);
        if (val !== null) {
          if (test.test_code) {
            valuesMap.set(test.test_code.toUpperCase(), val);
          }
          if (test.short_name) {
            valuesMap.set(test.short_name.toUpperCase(), val);
          }
        }
      }
    }

    // Loop to resolve formulas. We can do up to 3 passes to handle simple dependencies.
    let changed = false;
    for (let pass = 0; pass < 3; pass++) {
      changed = false;
      for (const test of this.resultTests) {
        if (test.type === 'group' && test.children) {
          for (const child of test.children) {
            if (child.formula) {
              const newVal = this.evaluateFormula(child.formula, valuesMap);
              if (newVal !== null && child.result_value !== newVal) {
                child.result_value = newVal;
                changed = true;
                if (child.test_code) {
                  valuesMap.set(child.test_code.toUpperCase(), parseFloat(newVal));
                }
                if (child.short_name) {
                  valuesMap.set(child.short_name.toUpperCase(), parseFloat(newVal));
                }
              }
            }
          }
        } else {
          if (test.formula) {
            const newVal = this.evaluateFormula(test.formula, valuesMap);
            if (newVal !== null && test.result_value !== newVal) {
              test.result_value = newVal;
              changed = true;
              if (test.test_code) {
                valuesMap.set(test.test_code.toUpperCase(), parseFloat(newVal));
              }
              if (test.short_name) {
                valuesMap.set(test.short_name.toUpperCase(), parseFloat(newVal));
              }
            }
          }
        }
      }
      if (!changed) break;
    }
  }

  evaluateFormula(formula: string, values: Map<string, number>): string | null {
    if (!formula) return null;

    let cleanFormula = formula.replace(/[\[\]]/g, ''); // strip brackets

    // Find all variable tokens (tokens with at least one letter)
    const tokenRegex = /[a-zA-Z0-9_-]+/g;
    let hasMissingVariable = false;

    const replaced = cleanFormula.replace(tokenRegex, (token) => {
      // Check if it is a variable (contains letters)
      if (/[a-zA-Z]/.test(token)) {
        const key = token.toUpperCase();
        if (values.has(key)) {
          return values.get(key)!.toString();
        } else {
          hasMissingVariable = true;
          return '0';
        }
      }
      return token;
    });

    if (hasMissingVariable) {
      return ''; // prerequisites are missing
    }

    const sanitized = replaced.replace(/[^0-9+\-*/().\s]/g, '');

    try {
      const result = new Function(`return (${sanitized});`)();
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return parseFloat(result.toFixed(2)).toString();
      }
    } catch (e) {
      console.error('Error evaluating formula:', formula, sanitized, e);
    }
    return '';
  }
}

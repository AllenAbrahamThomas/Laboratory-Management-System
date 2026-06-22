import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { StockService, ReagentItem } from '../../services/stock.service';
import { VisitService, LabPrintConfig } from '../../services/visit.service';
import {
  SettingsService,
  Doctor,
  Hospital,
  Patient,
  Department,
  Unit,
  Test,
  Method,
  Technology,
  DiscountReason,
  SMSTemplate,
  LabCustomization,
  TestReferenceRange,
  TestGroupItem
} from '../../services/settings.service';

type SettingsTab =
  | 'test'
  | 'department'
  | 'unit'
  | 'method'
  | 'technologies'
  | 'set-test-order'
  | 'set-group-test'
  | 'doctor'
  | 'hospital'
  | 'patient'
  | 'customer'
  | 'area'
  | 'contacts'
  | 'result-note-template'
  | 'set-result-template'
  | 'set-culture'
  | 'discount-reason'
  | 'set-discount-percentage'
  | 'set-hospital-collection'
  | 'set-sms-template'
  | 'set-customize-1'
  | 'set-customize-2'
  | 'set-customize-3';

@Component({
  selector: 'app-master-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './master-settings.component.html',
  styleUrl: './master-settings.component.css'
})
export class MasterSettingsComponent implements OnInit {
  @Input() activeAction: string | null = null;
  @Output() closed = new EventEmitter<void>();

  private readonly settingsService = inject(SettingsService);
  private readonly stockService = inject(StockService);
  private readonly authService = inject(AuthService);
  private readonly visitService = inject(VisitService);

  // User details
  currentUserRole = 'staff';
  currentUsername = '';

  // Tab State
  activeTab: SettingsTab = 'test';
  viewMode: 'list' | 'add' | 'edit' | 'ranges' | 'group' = 'list';

  // Loaded Data Lists
  itemsList: any[] = [];
  departments: Department[] = [];
  reagents: ReagentItem[] = [];
  allTests: Test[] = [];
  unitsList: Unit[] = [];

  // Editing state
  formData: any = {};
  selectedTest: Test | null = null;
  selectedGroupTestId: number | null = null;
  groupChildItems: TestGroupItem[] = [];
  selectedTestRanges: TestReferenceRange[] = [];
  rangeFormData: Partial<TestReferenceRange> = {};
  newGroupItemData: Partial<TestGroupItem> = {};
  showGroupCreateForm = false;
  newGroupTestData: any = {};

  // Department Reordering State (Set Test Order)
  reorderDepts: Department[] = [];
  technologiesList: Technology[] = [];
  searchQuery = '';
  printDeptFilter: string | number = 'all';
  techTestSearchQuery = '';
  newGroupChildSearchQuery = '';

  // Loading & Messages
  isLoading = false;
  successMessage = '';
  errorMessage = '';

  // Tab Groups
  readonly groups = [
    {
      label: 'Core Laboratory Setup',
      tabs: [
        { key: 'test', label: 'Test Master' },
        { key: 'department', label: 'Department Master' },
        { key: 'unit', label: 'Unit Master' },
        { key: 'method', label: 'Method Master' },
        { key: 'technologies', label: 'Technologies' },
        { key: 'set-test-order', label: 'Set Test Order' },
        { key: 'set-group-test', label: 'Set Group Test' }
      ]
    },
    {
      label: 'Stakeholders & Directory',
      tabs: [
        { key: 'doctor', label: 'Doctor Master' },
        { key: 'hospital', label: 'Hospital Master' },
        { key: 'patient', label: 'Patient Master' },
        { key: 'customer', label: 'Customer Master' },
        { key: 'area', label: 'Area Master' },
        { key: 'contacts', label: 'Contacts Directory' }
      ]
    },
    {
      label: 'Clinical Templates',
      tabs: [
        { key: 'result-note-template', label: 'Result Note Template' },
        { key: 'set-result-template', label: 'Set Result Template' },
        { key: 'set-culture', label: 'Set Culture (Microbiology)' }
      ]
    },
    {
      label: 'Billing & Financials',
      tabs: [
        { key: 'discount-reason', label: 'Discount Reasons' },
        { key: 'set-discount-percentage', label: 'Set Discount %' },
        { key: 'set-hospital-collection', label: 'Set Hospital Collection' }
      ]
    },
    {
      label: 'System Customization',
      tabs: [
        { key: 'set-sms-template', label: 'SMS Templates' },
        { key: 'set-customize-1', label: 'Customize 1 (Print)' },
        { key: 'set-customize-2', label: 'Customize 2 (Invoice)' },
        { key: 'set-customize-3', label: 'Customize 3 (System)' }
      ]
    }
  ];

  ngOnInit(): void {
    const session = this.authService.activeSession;
    if (session) {
      this.currentUserRole = session.user_group;
      this.currentUsername = session.username;
    }

    if (this.activeAction && this.isValidTab(this.activeAction)) {
      this.activeTab = this.activeAction as SettingsTab;
    } else {
      this.activeTab = 'test';
    }

    // Pre-load reference listings
    this.loadDepartmentsList();
    this.loadReagentsList();
    this.loadAllTestsList();
    this.loadTechnologiesList();
    this.loadUnitsList();

    this.changeTab(this.activeTab);
  }

  isValidTab(key: string): boolean {
    return this.groups.some(g => g.tabs.some(t => t.key === key));
  }

  isTabAllowed(key: string): boolean {
    if (this.currentUserRole === 'admin') {
      return true;
    }

    // Staff / Supervisor forbidden tabs
    const adminOnlyTabs = [
      'staff',
      'customer',
      'area',
      'contacts',
      'set-customize-1',
      'set-customize-2',
      'set-customize-3'
    ];

    if (adminOnlyTabs.includes(key)) {
      return false;
    }

    return true;
  }

  isDeleteAllowed(): boolean {
    return this.currentUserRole === 'admin' || this.currentUserRole === 'supervisor';
  }

  changeTab(tab: SettingsTab): void {
    this.activeTab = tab;
    this.viewMode = 'list';
    this.searchQuery = '';
    this.printDeptFilter = 'all';
    this.successMessage = '';
    this.errorMessage = '';
    this.selectedTest = null;
    this.selectedGroupTestId = null;

    if (this.isExplanationOnly(tab)) {
      return;
    }

    if (tab === 'set-test-order') {
      this.loadDeptsForReordering();
      return;
    }

    if (tab === 'set-group-test') {
      // Find a default group test if any
      this.loadAllTestsList();
      return;
    }

    this.loadList();
  }

  isExplanationOnly(tab: SettingsTab): boolean {
    return [
      'customer',
      'area',
      'contacts',
      'result-note-template',
      'set-result-template',
      'set-hospital-collection'
    ].includes(tab);
  }

  // Reference lists loaders
  loadDepartmentsList(): void {
    this.settingsService.getDepartments().subscribe(data => this.departments = data);
  }

  loadReagentsList(): void {
    this.stockService.getReagentItems().subscribe(data => this.reagents = data);
  }

  loadAllTestsList(): void {
    this.settingsService.getTests().subscribe(data => this.allTests = data);
  }

  loadTechnologiesList(): void {
    this.settingsService.getTechnologies().subscribe(data => this.technologiesList = data);
  }

  loadUnitsList(): void {
    this.settingsService.getUnits().subscribe(data => this.unitsList = data);
  }

  getTestFormUnits(): Unit[] {
    if (!this.unitsList) return [];
    const currentUnitName = this.formData?.unit;
    return this.unitsList.filter(u => u.is_active || u.name === currentUnitName);
  }

  get filteredItems(): any[] {
    let result = this.itemsList;

    if (this.activeTab === 'test') {
      if (this.printDeptFilter !== 'all') {
        const deptId = Number(this.printDeptFilter);
        result = result.filter(item => item.department === deptId);
      }
      if (this.searchQuery && this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase().trim();
        result = result.filter(item =>
          (item.test_code || '').toLowerCase().includes(q) ||
          (item.test_name || '').toLowerCase().includes(q) ||
          (item.short_name || '').toLowerCase().includes(q) ||
          (item.department_name || '').toLowerCase().includes(q)
        );
      }
      return result;
    }

    if (!this.searchQuery || !this.searchQuery.trim()) {
      return result;
    }
    const q = this.searchQuery.toLowerCase().trim();
    if (this.activeTab === 'department') {
      return result.filter(item =>
        (item.department_code || '').toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q)
      );
    }
    if (this.activeTab === 'unit') {
      return result.filter(item =>
        (item.name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }

  getTestsForTechnology(techId: number): string {
    if (!this.allTests || this.allTests.length === 0) return 'None';
    const matches = this.allTests.filter(t => t.technology === techId);
    if (matches.length === 0) return 'None';
    return matches.map(t => `${t.test_name} (${t.test_code})`).join(', ');
  }

  getFilteredTechTests(): Test[] {
    if (!this.allTests) return [];
    if (!this.techTestSearchQuery || !this.techTestSearchQuery.trim()) {
      return this.allTests;
    }
    const q = this.techTestSearchQuery.toLowerCase().trim();
    return this.allTests.filter(t => 
      (t.test_name || '').toLowerCase().includes(q) || 
      (t.test_code || '').toLowerCase().includes(q)
    );
  }

  isTechTestSelected(testId: number): boolean {
    if (!this.formData.associated_tests) return false;
    return this.formData.associated_tests.includes(testId);
  }

  toggleTechTestSelection(testId: number): void {
    if (!this.formData.associated_tests) {
      this.formData.associated_tests = [];
    }
    const index = this.formData.associated_tests.indexOf(testId);
    if (index > -1) {
      this.formData.associated_tests.splice(index, 1);
    } else {
      this.formData.associated_tests.push(testId);
    }
  }

  getFilteredNewGroupChildTests(): Test[] {
    if (!this.allTests) return [];
    const nonGroupTests = this.allTests.filter(t => !t.is_group);
    if (!this.newGroupChildSearchQuery || !this.newGroupChildSearchQuery.trim()) {
      return nonGroupTests;
    }
    const q = this.newGroupChildSearchQuery.toLowerCase().trim();
    return nonGroupTests.filter(t => 
      (t.test_name || '').toLowerCase().includes(q) || 
      (t.test_code || '').toLowerCase().includes(q)
    );
  }

  isNewGroupChildSelected(testId: number): boolean {
    if (!this.newGroupTestData.selected_child_tests) return false;
    return this.newGroupTestData.selected_child_tests.includes(testId);
  }

  toggleNewGroupChildSelection(testId: number): void {
    if (!this.newGroupTestData.selected_child_tests) {
      this.newGroupTestData.selected_child_tests = [];
    }
    const index = this.newGroupTestData.selected_child_tests.indexOf(testId);
    if (index > -1) {
      this.newGroupTestData.selected_child_tests.splice(index, 1);
    } else {
      this.newGroupTestData.selected_child_tests.push(testId);
    }
  }

  moveGroupItem(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= this.groupChildItems.length) {
      return;
    }

    const temp = this.groupChildItems[index];
    this.groupChildItems[index] = this.groupChildItems[targetIndex];
    this.groupChildItems[targetIndex] = temp;

    this.groupChildItems.forEach((item, idx) => {
      item.line_order = idx + 1;
    });

    this.saveGroupItemsOrder();
  }

  saveGroupItemsOrder(): void {
    this.isLoading = true;
    let completed = 0;
    this.groupChildItems.forEach(item => {
      this.settingsService.updateTestGroupItem(item.id!, item).subscribe({
        next: () => {
          completed++;
          if (completed === this.groupChildItems.length) {
            this.isLoading = false;
            this.onGroupTestSelect();
          }
        },
        error: () => {
          completed++;
          if (completed === this.groupChildItems.length) {
            this.isLoading = false;
            this.onGroupTestSelect();
          }
        }
      });
    });
  }

  // Load core table lists
  loadList(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.itemsList = [];

    const callback = {
      next: (data: any[]) => {
        this.itemsList = data;
        this.isLoading = false;
      },
      error: (err: any) => {
        this.errorMessage = 'Failed to load settings list.';
        this.isLoading = false;
      }
    };

    switch (this.activeTab) {
      case 'test':
        this.settingsService.getTests().subscribe(callback);
        break;
      case 'department':
        this.settingsService.getDepartments().subscribe(callback);
        break;
      case 'unit':
        this.settingsService.getUnits().subscribe(callback);
        break;
      case 'method':
        this.settingsService.getMethods().subscribe(callback);
        break;
      case 'technologies':
        this.settingsService.getTechnologies().subscribe(callback);
        break;
      case 'doctor':
        this.settingsService.getDoctors().subscribe(callback);
        break;
      case 'hospital':
        this.settingsService.getHospitals().subscribe(callback);
        break;
      case 'patient':
        this.settingsService.getPatients().subscribe(callback);
        break;
      case 'discount-reason':
        this.settingsService.getDiscountReasons().subscribe(callback);
        break;
      case 'set-sms-template':
        this.settingsService.getSMSTemplates().subscribe(callback);
        break;
      case 'set-customize-1':
      case 'set-customize-2':
      case 'set-customize-3':
        this.loadCustomizationsForActiveTab();
        break;
      default:
        this.isLoading = false;
    }
  }

  // Customizations loader
  loadCustomizationsForActiveTab(): void {
    this.settingsService.getCustomizations().subscribe({
      next: (data) => {
        const section = this.activeTab.replace('set-', '');
        this.itemsList = data.filter(c => c.section === section);
        
        // Prepare initial form data keys
        this.formData = {};
        this.itemsList.forEach(item => {
          this.formData[item.key] = item.value;
        });
        
        // Populate standard configs if empty
        const defaults: { [key: string]: string } = {
          print_header_margin: '20',
          print_footer_margin: '20',
          show_signature_on_report: 'true',
          show_letterhead: 'true',
          enable_barcode: 'false',
          thermal_printer: 'false',
          invoice_footer_note: 'Thank you for your visit!',
          session_timeout: '30',
          default_pay_mode: 'cash',
          auto_backup_enabled: 'false'
        };

        Object.keys(defaults).forEach(k => {
          if (this.formData[k] === undefined) {
            this.formData[k] = defaults[k];
          }
        });

        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load customizations.';
        this.isLoading = false;
      }
    });
  }

  // Save Customizations in Bulk
  saveCustomizations(): void {
    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    const section = this.activeTab.replace('set-', '');
    const keys = Object.keys(this.formData);
    let completed = 0;
    let hasError = false;

    keys.forEach(k => {
      const existing = this.itemsList.find(c => c.key === k);
      const payload: LabCustomization = {
        section,
        key: k,
        value: String(this.formData[k])
      };

      const handler = {
        next: () => {
          completed++;
          if (completed === keys.length) {
            this.isLoading = false;
            if (!hasError) this.successMessage = 'Settings saved successfully.';
            this.loadList();
          }
        },
        error: () => {
          hasError = true;
          completed++;
          if (completed === keys.length) {
            this.isLoading = false;
            this.errorMessage = 'Some settings failed to save.';
            this.loadList();
          }
        }
      };

      if (existing && existing.id) {
        this.settingsService.updateCustomization(existing.id, payload).subscribe(handler);
      } else {
        this.settingsService.createCustomization(payload).subscribe(handler);
      }
    });
  }

  // Department ordering
  loadDeptsForReordering(): void {
    this.isLoading = true;
    this.settingsService.getDepartments().subscribe({
      next: (data) => {
        this.reorderDepts = [...data].sort((a, b) => a.report_order - b.report_order);
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load departments.';
        this.isLoading = false;
      }
    });
  }

  moveDept(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= this.reorderDepts.length) {
      return;
    }

    const temp = this.reorderDepts[index];
    this.reorderDepts[index] = this.reorderDepts[targetIndex];
    this.reorderDepts[targetIndex] = temp;
  }

  saveDeptOrder(): void {
    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';
    let completed = 0;

    this.reorderDepts.forEach((dept, idx) => {
      dept.report_order = idx + 1;
      this.settingsService.updateDepartment(dept.id!, dept).subscribe({
        next: () => {
          completed++;
          if (completed === this.reorderDepts.length) {
            this.isLoading = false;
            this.successMessage = 'Department print order updated successfully.';
            this.loadDeptsForReordering();
          }
        },
        error: () => {
          completed++;
          if (completed === this.reorderDepts.length) {
            this.isLoading = false;
            this.errorMessage = 'Error occurred during order update.';
            this.loadDeptsForReordering();
          }
        }
      });
    });
  }

  // Group test child mapping loaders
  onGroupTestSelect(): void {
    if (!this.selectedGroupTestId) {
      this.groupChildItems = [];
      return;
    }

    this.isLoading = true;
    this.settingsService.getTestGroupItems(this.selectedGroupTestId).subscribe({
      next: (data) => {
        this.groupChildItems = data.sort((a, b) => a.line_order - b.line_order);
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load group test items.';
        this.isLoading = false;
      }
    });
  }

  deleteSelectedGroupTest(): void {
    if (!this.selectedGroupTestId) return;
    if (this.currentUserRole !== 'admin') return;

    const groupTest = this.allTests.find(t => t.id === Number(this.selectedGroupTestId));
    const testName = groupTest ? groupTest.test_name : 'Group Test';

    if (!confirm(`Are you sure you want to delete the group test "${testName}"? This will also remove all its child test links.`)) {
      return;
    }

    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    this.settingsService.deleteTest(Number(this.selectedGroupTestId)).subscribe({
      next: () => {
        this.successMessage = `Group test "${testName}" deleted successfully.`;
        this.selectedGroupTestId = null;
        this.groupChildItems = [];
        this.loadAllTestsList();
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || 'Failed to delete group test. It might be referenced in billing or visits.';
        this.isLoading = false;
      }
    });
  }

  addGroupChildItem(): void {
    if (!this.selectedGroupTestId || !this.newGroupItemData.child_test) {
      this.errorMessage = 'Please select a child test.';
      return;
    }

    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    const payload: TestGroupItem = {
      parent_test: this.selectedGroupTestId,
      child_test: Number(this.newGroupItemData.child_test),
      line_order: Number(this.newGroupItemData.line_order || (this.groupChildItems.length + 1))
    };

    this.settingsService.createTestGroupItem(payload).subscribe({
      next: () => {
        this.successMessage = 'Test added to group successfully.';
        this.newGroupItemData = {};
        this.onGroupTestSelect();
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || err.error?.non_field_errors?.[0] || 'Failed to add test to group.';
        this.isLoading = false;
      }
    });
  }

  deleteGroupChildItem(id: number): void {
    if (!confirm('Are you sure you want to remove this test from the group?')) {
      return;
    }

    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    this.settingsService.deleteTestGroupItem(id).subscribe({
      next: () => {
        this.successMessage = 'Test removed from group.';
        this.onGroupTestSelect();
      },
      error: () => {
        this.errorMessage = 'Failed to remove test from group.';
        this.isLoading = false;
      }
    });
  }

  toggleGroupCreateForm(): void {
    this.showGroupCreateForm = !this.showGroupCreateForm;
    if (this.showGroupCreateForm) {
      this.newGroupTestData = {
        test_code: '',
        rate: 0,
        default_discount_percent: 0,
        default_amount: 0,
        is_group: true,
        is_active: true,
        result_type: 'panel',
        selected_child_tests: []
      };
      this.newGroupChildSearchQuery = '';
      this.settingsService.getNextTestCode().subscribe({
        next: (res) => {
          this.newGroupTestData.test_code = res.test_code;
        },
        error: (err) => {
          console.error('Failed to fetch next test code:', err);
        }
      });
    }
  }

  saveNewGroupTest(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const childTestIds: number[] = this.newGroupTestData.selected_child_tests || [];

    const payload: Test = {
      test_code: this.newGroupTestData.test_code,
      test_name: this.newGroupTestData.test_name,
      short_name: this.newGroupTestData.short_name,
      department: Number(this.newGroupTestData.department),
      rate: Number(this.newGroupTestData.rate || 0),
      default_discount_percent: Number(this.newGroupTestData.default_discount_percent || 0),
      default_amount: Number(this.newGroupTestData.default_amount || 0),
      is_group: true,
      is_active: true,
      result_type: 'panel'
    };

    this.settingsService.createTest(payload).subscribe({
      next: (savedTest) => {
        const parentTestId = savedTest.id!;
        
        if (childTestIds.length === 0) {
          this.successMessage = 'Group Test created successfully.';
          this.finishNewGroupTestSave(parentTestId);
          return;
        }

        let completed = 0;
        const checkDone = () => {
          completed++;
          if (completed === childTestIds.length) {
            this.successMessage = 'Group Test created and child tests added successfully.';
            this.finishNewGroupTestSave(parentTestId);
          }
        };

        childTestIds.forEach((childId, idx) => {
          const itemPayload: TestGroupItem = {
            parent_test: parentTestId,
            child_test: childId,
            line_order: idx + 1
          };
          this.settingsService.createTestGroupItem(itemPayload).subscribe({
            next: checkDone,
            error: checkDone
          });
        });
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || err.error?.name?.[0] || err.error?.test_code?.[0] || 'Failed to create group test.';
        this.isLoading = false;
      }
    });
  }

  finishNewGroupTestSave(parentTestId: number): void {
    this.showGroupCreateForm = false;
    this.newGroupTestData = {};
    this.newGroupChildSearchQuery = '';
    this.settingsService.getTests().subscribe(data => {
      this.allTests = data;
      this.selectedGroupTestId = parentTestId;
      this.onGroupTestSelect();
      this.isLoading = false;
    });
  }

  // Reference Range Configuration
  openReferenceRangeConfig(test: Test): void {
    this.selectedTest = test;
    this.viewMode = 'ranges';
    this.rangeFormData = { test: test.id, gender: 'any', operator: 'between', is_active: true };
    this.successMessage = '';
    this.errorMessage = '';
    this.loadReferenceRanges();
  }

  loadReferenceRanges(): void {
    if (!this.selectedTest || !this.selectedTest.id) return;
    this.isLoading = true;
    this.settingsService.getTestReferenceRanges(this.selectedTest.id).subscribe({
      next: (data) => {
        this.selectedTestRanges = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load reference ranges.';
        this.isLoading = false;
      }
    });
  }

  saveReferenceRange(): void {
    if (!this.rangeFormData.display_text || !this.rangeFormData.display_text.trim()) {
      this.errorMessage = 'Display text range is required.';
      return;
    }

    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    const payload: TestReferenceRange = {
      test: this.selectedTest!.id!,
      gender: this.rangeFormData.gender || 'any',
      operator: this.rangeFormData.operator || 'between',
      min_value: this.rangeFormData.min_value ? Number(this.rangeFormData.min_value) : undefined,
      max_value: this.rangeFormData.max_value ? Number(this.rangeFormData.max_value) : undefined,
      display_text: this.rangeFormData.display_text.trim(),
      unit: this.rangeFormData.unit || '',
      is_active: this.rangeFormData.is_active !== false
    };

    if (this.rangeFormData.id) {
      this.settingsService.updateTestReferenceRange(this.rangeFormData.id, payload).subscribe({
        next: () => {
          this.successMessage = 'Reference range updated successfully.';
          this.rangeFormData = { test: this.selectedTest!.id, gender: 'any', operator: 'between', is_active: true };
          this.loadReferenceRanges();
        },
        error: () => {
          this.errorMessage = 'Failed to update reference range.';
          this.isLoading = false;
        }
      });
    } else {
      this.settingsService.createTestReferenceRange(payload).subscribe({
        next: () => {
          this.successMessage = 'Reference range added successfully.';
          this.rangeFormData = { test: this.selectedTest!.id, gender: 'any', operator: 'between', is_active: true };
          this.loadReferenceRanges();
        },
        error: () => {
          this.errorMessage = 'Failed to add reference range.';
          this.isLoading = false;
        }
      });
    }
  }

  editReferenceRange(range: TestReferenceRange): void {
    this.rangeFormData = { ...range };
  }

  deleteReferenceRange(id: number): void {
    if (!confirm('Are you sure you want to delete this reference range?')) {
      return;
    }

    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    this.settingsService.deleteTestReferenceRange(id).subscribe({
      next: () => {
        this.successMessage = 'Reference range deleted.';
        this.loadReferenceRanges();
      },
      error: () => {
        this.errorMessage = 'Failed to delete reference range.';
        this.isLoading = false;
      }
    });
  }

  // Standard Form handling (Add / Edit)
  openAdd(): void {
    this.formData = {};
    this.viewMode = 'add';
    this.successMessage = '';
    this.errorMessage = '';

    // Initialize defaults
    if (this.activeTab === 'patient') {
      this.formData.gender = 'male';
      this.formData.age_years = 0;
      this.formData.age_months = 0;
    } else if (this.activeTab === 'test') {
      this.formData.result_type = 'numeric';
      this.formData.is_group = false;
      this.formData.is_active = true;
      this.formData.reagent_auto_reduce = false;
      this.formData.rate = 0;
      this.formData.default_discount_percent = 0;
      this.formData.default_amount = 0;
      this.formData.test_code = '';
      this.settingsService.getNextTestCode().subscribe({
        next: (res) => {
          this.formData.test_code = res.test_code;
        },
        error: (err) => {
          console.error('Failed to fetch next test code:', err);
        }
      });
    } else if (this.activeTab === 'set-sms-template') {
      this.formData.event_name = 'registration';
    } else {
      this.formData.is_active = true;
    }

    if (this.activeTab === 'technologies') {
      this.formData.associated_tests = [];
      this.techTestSearchQuery = '';
    }
  }

  openEdit(item: any): void {
    this.formData = { ...item };
    this.viewMode = 'edit';
    this.successMessage = '';
    this.errorMessage = '';

    if (this.activeTab === 'technologies') {
      this.formData.associated_tests = this.allTests
        .filter(t => t.technology === item.id)
        .map(t => t.id);
      this.techTestSearchQuery = '';
    }
  }

  saveForm(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const tab = this.activeTab;
    const isEdit = this.viewMode === 'edit';
    const id = this.formData.id;

    // Standard handler
    const handler = {
      next: () => {
        this.successMessage = `${this.getTabLabel(tab)} saved successfully.`;
        this.viewMode = 'list';
        this.loadList();
        if (tab === 'unit') {
          this.loadUnitsList();
        }
      },
      error: (err: any) => {
        this.errorMessage = err.error?.detail || err.error?.name?.[0] || err.error?.test_code?.[0] || 'Failed to save record.';
        this.isLoading = false;
      }
    };

    switch (tab) {
      case 'doctor':
        const doc: Doctor = this.formData;
        if (isEdit) this.settingsService.updateDoctor(id, doc).subscribe(handler);
        else this.settingsService.createDoctor(doc).subscribe(handler);
        break;

      case 'hospital':
        const hosp: Hospital = this.formData;
        if (isEdit) this.settingsService.updateHospital(id, hosp).subscribe(handler);
        else this.settingsService.createHospital(hosp).subscribe(handler);
        break;

      case 'patient':
        const pat: Patient = this.formData;
        if (isEdit) this.settingsService.updatePatient(id, pat).subscribe(handler);
        else this.settingsService.createPatient(pat).subscribe(handler);
        break;

      case 'department':
        const dept: Department = this.formData;
        if (isEdit) this.settingsService.updateDepartment(id, dept).subscribe(handler);
        else this.settingsService.createDepartment(dept).subscribe(handler);
        break;

      case 'unit':
        const unit: Unit = this.formData;
        if (isEdit) this.settingsService.updateUnit(id, unit).subscribe(handler);
        else this.settingsService.createUnit(unit).subscribe(handler);
        break;

      case 'method':
        const meth: Method = this.formData;
        if (isEdit) this.settingsService.updateMethod(id, meth).subscribe(handler);
        else this.settingsService.createMethod(meth).subscribe(handler);
        break;

      case 'technologies':
        const techObj: Technology = {
          id: this.formData.id,
          name: this.formData.name,
          is_active: this.formData.is_active
        };
        const associatedTests: number[] = this.formData.associated_tests || [];
        
        const afterSaveTechnology = (savedTech: Technology) => {
          const techId = savedTech.id!;
          const testsToClear = this.allTests.filter(t => t.technology === techId && !associatedTests.includes(t.id!));
          const testsToSet = this.allTests.filter(t => associatedTests.includes(t.id!) && t.technology !== techId);
          
          let updatesTodo = testsToClear.length + testsToSet.length;
          if (updatesTodo === 0) {
            this.successMessage = `Analyzer/Technology saved successfully.`;
            this.viewMode = 'list';
            this.loadList();
            this.loadAllTestsList();
            return;
          }
          
          let completedUpdates = 0;
          const checkCompleted = () => {
            completedUpdates++;
            if (completedUpdates === updatesTodo) {
              this.successMessage = `Analyzer/Technology saved and test associations updated successfully.`;
              this.viewMode = 'list';
              this.loadList();
              this.loadAllTestsList();
            }
          };
          
          testsToClear.forEach(t => {
            const updatedTest = { ...t, technology: undefined };
            this.settingsService.updateTest(t.id!, updatedTest).subscribe({
              next: checkCompleted,
              error: checkCompleted
            });
          });
          
          testsToSet.forEach(t => {
            const updatedTest = { ...t, technology: techId };
            this.settingsService.updateTest(t.id!, updatedTest).subscribe({
              next: checkCompleted,
              error: checkCompleted
            });
          });
        };

        if (isEdit) {
          this.settingsService.updateTechnology(id, techObj).subscribe({
            next: (data) => afterSaveTechnology(data),
            error: (err) => {
              this.errorMessage = err.error?.detail || err.error?.name?.[0] || 'Failed to update technology.';
              this.isLoading = false;
            }
          });
        } else {
          this.settingsService.createTechnology(techObj).subscribe({
            next: (data) => afterSaveTechnology(data),
            error: (err) => {
              this.errorMessage = err.error?.detail || err.error?.name?.[0] || 'Failed to create technology.';
              this.isLoading = false;
            }
          });
        }
        break;

      case 'discount-reason':
        const disc: DiscountReason = this.formData;
        if (isEdit) this.settingsService.updateDiscountReason(id, disc).subscribe(handler);
        else this.settingsService.createDiscountReason(disc).subscribe(handler);
        break;

      case 'set-sms-template':
        const sms: SMSTemplate = this.formData;
        if (isEdit) this.settingsService.updateSMSTemplate(id, sms).subscribe(handler);
        else this.settingsService.createSMSTemplate(sms).subscribe(handler);
        break;

      case 'test':
        const test: Test = {
          ...this.formData,
          department: Number(this.formData.department),
          reagent_item: this.formData.reagent_item ? Number(this.formData.reagent_item) : undefined,
          technology: this.formData.technology ? Number(this.formData.technology) : undefined,
          rate: Number(this.formData.rate || 0),
          default_discount_percent: Number(this.formData.default_discount_percent || 0),
          default_amount: Number(this.formData.default_amount || 0),
          reagent_quantity: (this.formData.reagent_quantity !== null && this.formData.reagent_quantity !== undefined && this.formData.reagent_quantity !== '') ? Number(this.formData.reagent_quantity) : null
        };
        if (isEdit) this.settingsService.updateTest(id, test).subscribe(handler);
        else this.settingsService.createTest(test).subscribe(handler);
        break;

      default:
        this.isLoading = false;
        this.errorMessage = 'Unknown tab layout submission.';
    }
  }

  deleteItem(id: number, name: string): void {
    if (!this.isDeleteAllowed()) {
      return;
    }

    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    this.isLoading = true;
    this.successMessage = '';
    this.errorMessage = '';

    const handler = {
      next: () => {
        this.successMessage = 'Record deleted successfully.';
        this.loadList();
        if (this.activeTab === 'unit') {
          this.loadUnitsList();
        }
      },
      error: () => {
        this.errorMessage = 'Failed to delete record. It may be referenced elsewhere.';
        this.isLoading = false;
      }
    };

    switch (this.activeTab) {
      case 'doctor':
        this.settingsService.deleteDoctor(id).subscribe(handler);
        break;
      case 'hospital':
        this.settingsService.deleteHospital(id).subscribe(handler);
        break;
      case 'patient':
        this.settingsService.deletePatient(id).subscribe(handler);
        break;
      case 'department':
        this.settingsService.deleteDepartment(id).subscribe(handler);
        break;
      case 'unit':
        this.settingsService.deleteUnit(id).subscribe(handler);
        break;
      case 'method':
        this.settingsService.deleteMethod(id).subscribe(handler);
        break;
      case 'technologies':
        this.settingsService.deleteTechnology(id).subscribe(handler);
        break;
      case 'discount-reason':
        this.settingsService.deleteDiscountReason(id).subscribe(handler);
        break;
      case 'set-sms-template':
        this.settingsService.deleteSMSTemplate(id).subscribe(handler);
        break;
      case 'test':
        this.settingsService.deleteTest(id).subscribe(handler);
        break;
      default:
        this.isLoading = false;
    }
  }

  getTabLabel(key: string): string {
    for (const g of this.groups) {
      const t = g.tabs.find(x => x.key === key);
      if (t) return t.label;
    }
    return 'Setting';
  }

  onRateOrAmountChange(): void {
    if (this.activeTab !== 'test') return;
    const rate = Number(this.formData.rate || 0);
    const amount = Number(this.formData.default_amount || 0);
    if (rate > 0) {
      const discount = ((rate - amount) / rate) * 100;
      this.formData.default_discount_percent = Math.round((discount + Number.EPSILON) * 100) / 100;
    } else {
      this.formData.default_discount_percent = 0;
    }
  }

  mapResultType(type: string): string {
    switch (type) {
      case 'numeric': return 'Numeric';
      case 'text': return 'Text';
      case 'choice': return 'Choice';
      case 'panel': return 'Panel';
      default: return type || '-';
    }
  }

  printCatalogue(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    forkJoin({
      printConfig: this.visitService.getLabPrintConfig(),
      groupItems: this.settingsService.getTestGroupItems()
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.generatePrintOut(res.printConfig, res.groupItems);
      },
      error: (err) => {
        console.error('Failed to load catalog print details', err);
        // Fallback: try to print with whatever is loaded without print config
        this.settingsService.getTestGroupItems().subscribe({
          next: (groupItems) => {
            this.isLoading = false;
            this.generatePrintOut(null, groupItems);
          },
          error: () => {
            this.isLoading = false;
            this.errorMessage = 'Failed to load test group items for printing.';
          }
        });
      }
    });
  }

  generatePrintOut(printConfig: LabPrintConfig | null, groupItems: TestGroupItem[]): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.errorMessage = 'Pop-up blocker is preventing catalogue printing. Please allow pop-ups for this site.';
      return;
    }

    const labName = printConfig?.lab_name || 'Neethi Clinical Lab';
    const subtitle = printConfig?.subtitle || 'Clinical Laboratory & Diagnostics';
    const address = printConfig?.address || '';
    const phone = printConfig?.phone || '';
    const logoUrl = printConfig?.logo_url || '';

    // Filter tests by selected department if not 'all'
    let itemsToPrint = this.filteredItems;
    let deptNameSuffix = '';
    if (this.printDeptFilter !== 'all') {
      const deptId = Number(this.printDeptFilter);
      itemsToPrint = itemsToPrint.filter(item => item.department === deptId);
      const selectedDeptObj = this.departments.find(d => d.id === deptId);
      if (selectedDeptObj) {
        deptNameSuffix = ` - ${selectedDeptObj.name}`;
      }
    }

    const testRows: string[] = [];

    itemsToPrint.forEach(item => {
      // 1. Parent/General Test Row
      const rateVal = typeof item.rate === 'number' ? item.rate : parseFloat(item.rate || '0');
      const isGroup = !!item.is_group;
      const rowClass = isGroup ? 'group-parent-row' : 'standard-row';
      const badgeHtml = isGroup ? '<span class="group-badge">GROUP</span>' : '';
      
      testRows.push(`
        <tr class="${rowClass}">
          <td style="font-weight: ${isGroup ? 'bold' : 'normal'};">${item.test_code}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: ${isGroup ? '700' : '600'}; color: ${isGroup ? '#1e3a8a' : '#1f2937'};">${item.test_name}</span>
              ${badgeHtml}
            </div>
          </td>
          <td>${item.short_name || '-'}</td>
          <td>${item.department_name || '-'}</td>
          <td>${this.mapResultType(item.result_type)}</td>
          <td>${item.unit || '-'}</td>
          <td style="text-align: right; font-weight: bold; color: #111827;">₹${rateVal.toFixed(2)}</td>
        </tr>
      `);

      // 2. Child Test Rows if Group
      if (isGroup) {
        const children = groupItems.filter(gi => gi.parent_test === item.id);
        children.forEach(childItem => {
          const childTest = this.allTests.find(t => t.id === childItem.child_test);
          const childRate = childTest ? (typeof childTest.rate === 'number' ? childTest.rate : parseFloat(childTest.rate || '0')) : 0;
          const childName = childItem.child_test_name || childTest?.test_name || 'Unknown Child Test';
          const childCode = childItem.child_test_code || childTest?.test_code || '-';
          const childShort = childTest?.short_name || '-';
          const childDept = childTest?.department_name || '-';
          const childType = childTest ? this.mapResultType(childTest.result_type) : '-';
          const childUnit = childTest?.unit || '-';

          testRows.push(`
            <tr class="group-child-row">
              <td style="padding-left: 20px; color: #6b7280;">└─ ${childCode}</td>
              <td style="padding-left: 20px; color: #374151; font-style: italic;">└─ ${childName}</td>
              <td style="color: #6b7280;">${childShort}</td>
              <td style="color: #6b7280;">${childDept}</td>
              <td style="color: #6b7280;">${childType}</td>
              <td style="color: #6b7280;">${childUnit}</td>
              <td style="text-align: right; color: #9ca3af; font-size: 10px;">₹${childRate.toFixed(2)} (Indiv.)</td>
            </tr>
          `);
        });
      }
    });

    const dateStr = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Master Catalogue</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            body {
              font-family: 'Inter', sans-serif;
              padding: 40px;
              color: #1f2937;
              background-color: #fff;
              font-size: 11px;
              line-height: 1.5;
            }
            
            /* Header Styling */
            .header-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #1e3a8a;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .lab-details {
              flex: 1;
            }
            .lab-name {
              font-size: 24px;
              font-weight: 700;
              color: #1e3a8a;
              margin: 0 0 4px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .lab-subtitle {
              font-size: 12px;
              color: #4b5563;
              margin: 0 0 8px 0;
              font-weight: 500;
            }
            .lab-contact {
              font-size: 10px;
              color: #6b7280;
              margin: 2px 0;
            }
            .logo-container {
              max-height: 70px;
              max-width: 200px;
            }
            .logo-container img {
              max-height: 70px;
              object-fit: contain;
            }
            
            /* Title & Metadata */
            .report-title-bar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 20px;
            }
            .report-title {
              font-size: 16px;
              font-weight: 700;
              color: #111827;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .meta-item {
              font-size: 10px;
              color: #4b5563;
              background-color: #f3f4f6;
              padding: 4px 10px;
              border-radius: 4px;
              font-weight: 500;
            }

            /* Table Design */
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th {
              background-color: #f3f4f6;
              color: #374151;
              font-weight: 600;
              text-align: left;
              padding: 8px 10px;
              border-bottom: 2px solid #e5e7eb;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            td {
              padding: 8px 10px;
              border-bottom: 1px solid #f3f4f6;
              vertical-align: middle;
            }
            
            /* Rows styling */
            .group-parent-row {
              background-color: #f9fafb;
            }
            .group-parent-row td {
              border-top: 1px solid #e5e7eb;
              border-bottom: 1px dashed #e5e7eb;
            }
            .group-child-row td {
              padding-top: 5px;
              padding-bottom: 5px;
              background-color: #fff;
              border-bottom: 1px solid #f3f4f6;
              font-size: 10.5px;
            }
            .group-badge {
              font-size: 8px;
              font-weight: 700;
              background-color: #dbeafe;
              color: #1e40af;
              padding: 2px 6px;
              border-radius: 9999px;
              letter-spacing: 0.5px;
            }
            
            /* Print configuration */
            @media print {
              body {
                padding: 20px;
                font-size: 10px;
              }
              th, td {
                padding: 6px 8px;
              }
              .group-child-row td {
                padding-top: 4px;
                padding-bottom: 4px;
              }
              tr {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header-container">
            <div class="lab-details">
              <h1 class="lab-name">${labName}</h1>
              <div class="lab-subtitle">${subtitle}</div>
              ${address ? `<div class="lab-contact"><strong>Address:</strong> ${address}</div>` : ''}
              ${phone ? `<div class="lab-contact"><strong>Phone:</strong> ${phone}</div>` : ''}
            </div>
            ${logoUrl ? `<div class="logo-container"><img src="${logoUrl}" alt="Lab Logo"></div>` : ''}
          </div>
          
          <div class="report-title-bar">
            <h2 class="report-title">Test Master Catalogue${deptNameSuffix}</h2>
            <div style="display: flex; gap: 8px;">
              <div class="meta-item">Total Items: ${itemsToPrint.length}</div>
              <div class="meta-item">Date: ${dateStr}</div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 100px;">Test Code</th>
                <th>Test Name</th>
                <th style="width: 100px;">Short Name</th>
                <th style="width: 140px;">Department</th>
                <th style="width: 100px;">Result Type</th>
                <th style="width: 90px;">Unit</th>
                <th style="width: 90px; text-align: right;">Rate</th>
              </tr>
            </thead>
            <tbody>
              ${testRows.join('') || '<tr><td colspan="7" style="text-align: center; padding: 20px;">No tests found.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  close(): void {
    this.closed.emit();
  }
}

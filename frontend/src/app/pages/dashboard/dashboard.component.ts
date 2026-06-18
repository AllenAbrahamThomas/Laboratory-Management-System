import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BillRegistrationComponent } from '../lab-registration/bill-registration/bill-registration.component';
import { PatientListComponent } from '../lab-registration/patient-list/patient-list.component';
import { PatientAdvanceSearchComponent } from '../patient-advance-search/patient-advance-search.component';
import { CollectionSummaryDialogComponent } from '../reports/collection-summary-dialog/collection-summary-dialog.component';
import { ResultEntryComponent } from '../result-entry/result-entry.component';
import { AuthService, LoginSession } from '../../services/auth.service';
import { ClockService } from '../../services/clock.service';
import { AccountsHeadsComponent } from '../accounts/accounts-heads/accounts-heads.component';
import { CashVoucherComponent } from '../accounts/cash-voucher/cash-voucher.component';
import { DayBookComponent } from '../accounts/day-book/day-book.component';
import { JournalComponent } from '../accounts/journal/journal.component';
import { ReagentItemsComponent } from '../stock/reagent-items/reagent-items.component';
import { StockTransactionComponent } from '../stock/stock-transaction/stock-transaction.component';
import { StockReportComponent } from '../stock/stock-report/stock-report.component';
import { UserManagementComponent } from '../accounts/user-management/user-management.component';

type EntryAction =
  | 'invoice-entry'
  | 'edit-invoice'
  | 'patient-advance-search'
  | 'pending-collection'
  | 'result-entry'
  | 'remove-report-authorization'
  | 'exit';

type TopMenuKey = 'entries' | 'accounts' | 'master-settings' | 'reports' | 'stock' | 'help';

type TopMenuAction =
  | EntryAction
  | 'accounts-heads'
  | 'cash-payments'
  | 'cash-receipts'
  | 'day-book'
  | 'journal'
  | 'reagent-items'
  | 'stock-inward'
  | 'stock-outward'
  | 'stock-report'
  | 'test'
  | 'department'
  | 'unit'
  | 'method'
  | 'technologies'
  | 'area'
  | 'contacts'
  | 'result-note-template'
  | 'doctor'
  | 'hospital'
  | 'patient'
  | 'staff'
  | 'customer'
  | 'discount-reason'
  | 'set-test-order'
  | 'set-group-test'
  | 'set-hospital-collection'
  | 'set-customize-1'
  | 'set-customize-2'
  | 'set-customize-3'
  | 'set-special-rate'
  | 'set-sms-template'
  | 'set-discount-percentage'
  | 'set-result-template'
  | 'set-culture'
  | 'statments'
  | 'master-values'
  | 'accounts-statements'
  | 'daily-collection-statement'
  | 'daily-collection-summary-division-wise'
  | 'monthly-collection-summary-division-wise'
  | 'collection-summary'
  | 'credit-client-invoice-summary'
  | 'credit-client-invoice'
  | 'user-wise-collection'
  | 'pending-register'
  | 'pending-collection-register'
  | 'result-register'
  | 'cancelled-invoices'
  | 'doctor-wise-invoices'
  | 'hospital-wise-invoices'
  | 'patient-wise-invoices'
  | 'test-wise-invoices'
  | 'sample-collection-wise-invoices'
  | 'division-wise-invoices'
  | 'branch-wise-invoices'
  | 'test-performance'
  | 'test-price-list'
  | 'test-detailed'
  | 'doctors'
  | 'hospitals'
  | 'patients'
  | 'employees'
  | 'departments'
  | 'divisions'
  | 'methods'
  | 'units'
  | 'payments-statement'
  | 'receipts-statement'
  | 'income-expense-statement'
  | 'other-income-expense-statement'
  | 'ledger'
  | 'cash-statement'
  | 'bank-statement'
  | 'about-us'
  | 'our-features';

type DropdownItem = {
  label: string;
  action: TopMenuAction;
  badge?: string;
  hasChildIndicator?: boolean;
  children?: ReadonlyArray<DropdownItem>;
  childWidth?: number;
};

type TopMenu = {
  key: TopMenuKey;
  label: string;
  width: number;
  items: ReadonlyArray<DropdownItem>;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    PatientListComponent,
    BillRegistrationComponent,
    PatientAdvanceSearchComponent,
    CollectionSummaryDialogComponent,
    ResultEntryComponent,
    AccountsHeadsComponent,
    CashVoucherComponent,
    DayBookComponent,
    JournalComponent,
    ReagentItemsComponent,
    StockTransactionComponent,
    StockReportComponent,
    UserManagementComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentTime$ = inject(ClockService).currentTime$;
  readonly dropdownMenus: ReadonlyArray<TopMenu> = [
    {
      key: 'entries',
      label: 'Entries',
      width: 276,
      items: [
        { label: 'Invoice entry/ Registration', action: 'invoice-entry', badge: 'I' },
        { label: 'Edit Invoice', action: 'edit-invoice', badge: 'E' },
        { label: 'Patient Advance search', action: 'patient-advance-search', badge: 'P' },
        { label: 'Pending Collection', action: 'pending-collection', badge: 'C' },
        { label: 'Result Entry', action: 'result-entry', badge: 'R' },
        { label: 'Remove report Authorization', action: 'remove-report-authorization', badge: 'A' },
        { label: 'Exit', action: 'exit', badge: 'X' },
      ],
    },
    {
      key: 'accounts',
      label: 'Accounts',
      width: 195,
      items: [
        { label: 'Accounts Heads', action: 'accounts-heads', badge: 'A' },
        { label: 'Cash Payments', action: 'cash-payments', badge: 'C' },
        { label: 'Cash Receipts', action: 'cash-receipts', badge: 'R' },
        { label: 'Day book', action: 'day-book', badge: 'D' },
        { label: 'Journal', action: 'journal', badge: 'J' },
      ],
    },
    {
      key: 'master-settings',
      label: 'Master Settings',
      width: 208,
      items: [
        { label: 'Test', action: 'test', badge: 'T' },
        { label: 'Department', action: 'department', badge: 'D' },
        { label: 'Unit', action: 'unit', badge: 'U' },
        { label: 'Method', action: 'method', badge: 'M' },
        { label: 'Technologies', action: 'technologies', badge: 'N' },
        { label: 'Area', action: 'area', badge: 'A' },
        { label: 'Contacts', action: 'contacts', badge: 'C' },
        { label: 'Result Note Template', action: 'result-note-template', badge: 'R' },
        { label: 'Doctor', action: 'doctor', badge: 'D' },
        { label: 'Hospital', action: 'hospital', badge: 'H' },
        { label: 'Patient', action: 'patient', badge: 'P' },
        { label: 'User Management', action: 'staff', badge: 'U' },
        { label: 'Customer', action: 'customer', badge: 'C' },
        { label: 'Discount reason', action: 'discount-reason', badge: '%' },
        { label: 'Set test order', action: 'set-test-order', badge: 'O' },
        { label: 'Set Group test', action: 'set-group-test', badge: 'G' },
        { label: 'Set Hospital Collection', action: 'set-hospital-collection', badge: 'L' },
        { label: 'Set Customize1', action: 'set-customize-1', badge: '1' },
        { label: 'Set Customize2', action: 'set-customize-2', badge: '2' },
        { label: 'Set Customize3', action: 'set-customize-3', badge: '3' },
        { label: 'Set Special rate', action: 'set-special-rate', badge: 'S' },
        { label: 'Set SMS Template', action: 'set-sms-template', badge: 'M' },
        { label: 'Set Discount Percentage', action: 'set-discount-percentage', badge: '%' },
        { label: 'Set Result Template', action: 'set-result-template', badge: 'R' },
        { label: 'Set Culture', action: 'set-culture', badge: 'C' },
      ],
    },
    {
      key: 'reports',
      label: 'Reports',
      width: 190,
      items: [
        {
          label: 'Statments',
          action: 'statments',
          badge: 'S',
          hasChildIndicator: true,
          childWidth: 306,
          children: [
            { label: 'Daily Collection Statement', action: 'daily-collection-statement' },
            { label: 'Daily Collection summary Division wise', action: 'daily-collection-summary-division-wise' },
            { label: 'Monthly collection summary Division wise', action: 'monthly-collection-summary-division-wise' },
            { label: 'Collection Summary', action: 'collection-summary' },
            { label: 'Credit/Client Invoice summary', action: 'credit-client-invoice-summary' },
            { label: 'Credit/Client Invoice', action: 'credit-client-invoice' },
            { label: 'User wise Collection', action: 'user-wise-collection' },
            { label: 'Pending Register', action: 'pending-register' },
            { label: 'Pending collection register', action: 'pending-collection-register' },
            { label: 'Result Register', action: 'result-register' },
            { label: 'Cancelled Invoices', action: 'cancelled-invoices' },
            { label: 'Doctor wise Invoices', action: 'doctor-wise-invoices' },
            { label: 'Hospital wise Invoices', action: 'hospital-wise-invoices' },
            { label: 'Patient wise Invoices', action: 'patient-wise-invoices' },
            { label: 'Test wise Invoices', action: 'test-wise-invoices' },
            { label: 'Sample Collection wise Invoices', action: 'sample-collection-wise-invoices' },
            { label: 'Division wise Invoices', action: 'division-wise-invoices' },
            { label: 'Test Performance', action: 'test-performance' },
          ],
        },
        {
          label: 'Master Values',
          action: 'master-values',
          badge: 'M',
          hasChildIndicator: true,
          childWidth: 248,
          children: [
            { label: 'Test price list', action: 'test-price-list' },
            { label: 'Test detailed', action: 'test-detailed' },
            { label: 'Doctors', action: 'doctors' },
            { label: 'Hospitals', action: 'hospitals' },
            { label: 'Patients', action: 'patients' },
            { label: 'Employees', action: 'employees' },
            { label: 'Departments', action: 'departments' },
            { label: 'Divisions', action: 'divisions' },
            { label: 'Methods', action: 'methods' },
            { label: 'Units', action: 'units' },
            { label: 'Technologies', action: 'technologies' },
          ],
        },
        {
          label: 'Accounts Statements',
          action: 'accounts-statements',
          badge: 'A',
          hasChildIndicator: true,
          childWidth: 254,
          children: [
            { label: 'Payments Statement', action: 'payments-statement' },
            { label: 'Receipts Statement', action: 'receipts-statement' },
            { label: 'Income/Expense Statement', action: 'income-expense-statement' },
            { label: 'Other Income/Expense Statement', action: 'other-income-expense-statement' },
            { label: 'Ledger', action: 'ledger' },
            { label: 'Cash Statement', action: 'cash-statement' },
            { label: 'Bank Statement', action: 'bank-statement' },
          ],
        },
      ],
    },
    {
      key: 'stock',
      label: 'Stock',
      width: 210,
      items: [
        { label: 'Reagent Items', action: 'reagent-items', badge: 'R' },
        { label: 'Stock Inward (Receipt)', action: 'stock-inward', badge: 'I' },
        { label: 'Stock Outward (Consumption)', action: 'stock-outward', badge: 'C' },
        { label: 'Current Stock Report', action: 'stock-report', badge: 'S' },
      ],
    },
    {
      key: 'help',
      label: 'Help',
      width: 175,
      items: [
        { label: 'About us', action: 'about-us' },
        { label: 'Our features', action: 'our-features' },
      ],
    },
  ];

  activeSession: LoginSession | null = null;
  activeRegistrationView:
    | 'patients'
    | 'pending-collection'
    | 'new-registration'
    | 'patient-advance-search'
    | 'result-entry'
    | 'accounts-heads'
    | 'cash-payments'
    | 'cash-receipts'
    | 'day-book'
    | 'journal'
    | 'reagent-items'
    | 'stock-inward'
    | 'stock-outward'
    | 'stock-report'
    | 'user-management'
    | null = null;
  selectedVisitId: number | null = null;
  billOpenMode: 'new' | 'existing' | 'prefill-only' = 'new';
  patientListPurpose: 'registration' | 'result' = 'registration';
  activeCollectionSummaryMode: 'daily' | 'monthly' | 'department-wise-daily' | 'department-wise-monthly' | null = null;
  activeCollectionSummaryTitle = 'Collection summary';
  openTopMenu: TopMenuKey | null = null;
  openReportsSubmenu: TopMenuAction | null = null;

  readonly menuItems = [
    'Lab registration',
    'Result entry',
    'Pending Collection',
    'Patient Adv. Search',
    'About us',
    'Log off',
  ];

  ngOnInit(): void {
    this.activeSession = this.authService.activeSession;

    if (!this.activeSession) {
      this.router.navigateByUrl('');
    }
  }

  @HostListener('document:click')
  closeTopMenu(): void {
    this.openTopMenu = null;
    this.openReportsSubmenu = null;
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleEnterShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const tagName = target.tagName;
    const editable = tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true';
    if (editable) {
      return;
    }

    if (this.activeRegistrationView === null) {
      event.preventDefault();
      this.activeRegistrationView = 'patients';
      return;
    }

    if (this.activeRegistrationView === 'patients') {
      event.preventDefault();
      this.openNewRegistration();
    }
  }

  handleMenuClick(item: string): void {
    if (item === 'Lab registration') {
      this.patientListPurpose = 'registration';
      this.activeRegistrationView = 'patients';
      return;
    }

    if (item === 'Patient Adv. Search') {
      this.activeRegistrationView = 'patient-advance-search';
      return;
    }

    if (item === 'Pending Collection') {
      this.activeRegistrationView = 'pending-collection';
      return;
    }

    if (item === 'Result entry') {
      this.selectedVisitId = null;
      this.patientListPurpose = 'result';
      this.activeRegistrationView = 'patients';
      return;
    }

    if (item === 'Log off') {
      this.logout();
    }
  }

  toggleTopMenu(menuKey: TopMenuKey, event: MouseEvent): void {
    event.stopPropagation();
    const nextOpenMenu = this.openTopMenu === menuKey ? null : menuKey;
    this.openTopMenu = nextOpenMenu;
    this.openReportsSubmenu = nextOpenMenu === 'reports' ? 'statments' : null;
  }

  openSubmenu(action: TopMenuAction | null): void {
    this.openReportsSubmenu = action;
  }

  handleTopMenuItemClick(action: TopMenuAction, event: MouseEvent): void {
    event.stopPropagation();
    const reportsMenu = this.dropdownMenus.find((menu) => menu.key === 'reports');
    const hasChildren = reportsMenu?.items.some((item) => item.action === action && item.children?.length);

    if (hasChildren) {
      this.openReportsSubmenu = action;
      return;
    }

    this.openTopMenu = null;
    this.openReportsSubmenu = null;

    if (action === 'invoice-entry') {
      this.patientListPurpose = 'registration';
      this.activeRegistrationView = 'patients';
      return;
    }

    if (action === 'edit-invoice') {
      this.selectedVisitId = null;
      this.billOpenMode = 'existing';
      this.activeRegistrationView = 'new-registration';
      return;
    }

    if (action === 'patient-advance-search') {
      this.activeRegistrationView = 'patient-advance-search';
      return;
    }

    if (action === 'pending-collection') {
      this.activeRegistrationView = 'pending-collection';
      return;
    }

    if (action === 'result-entry') {
      this.selectedVisitId = null;
      this.patientListPurpose = 'result';
      this.activeRegistrationView = 'patients';
      return;
    }

    if (action === 'daily-collection-statement') {
      this.openCollectionSummary('daily', 'Daily Collection Summary');
      return;
    }

    if (action === 'collection-summary') {
      this.openCollectionSummary('monthly', 'Monthly Collection Summary');
      return;
    }

    if (action === 'daily-collection-summary-division-wise') {
      this.openCollectionSummary('department-wise-daily', 'Department Wise Daily Collection Summary');
      return;
    }

    if (action === 'monthly-collection-summary-division-wise') {
      this.openCollectionSummary('department-wise-monthly', 'Department Wise Monthly Collection Summary');
      return;
    }

    if (action === 'accounts-heads') {
      this.activeRegistrationView = 'accounts-heads';
      return;
    }

    if (action === 'cash-payments') {
      this.activeRegistrationView = 'cash-payments';
      return;
    }

    if (action === 'cash-receipts') {
      this.activeRegistrationView = 'cash-receipts';
      return;
    }

    if (action === 'day-book') {
      this.activeRegistrationView = 'day-book';
      return;
    }

    if (action === 'journal') {
      this.activeRegistrationView = 'journal';
      return;
    }

    if (action === 'reagent-items') {
      this.activeRegistrationView = 'reagent-items';
      return;
    }

    if (action === 'stock-inward') {
      this.activeRegistrationView = 'stock-inward';
      return;
    }

    if (action === 'stock-outward') {
      this.activeRegistrationView = 'stock-outward';
      return;
    }

    if (action === 'stock-report') {
      this.activeRegistrationView = 'stock-report';
      return;
    }

    if (action === 'staff') {
      this.activeRegistrationView = 'user-management';
      return;
    }

    if (action === 'exit') {
      this.logout();
    }
  }

  openNewRegistration(): void {
    this.selectedVisitId = null;
    this.billOpenMode = 'new';
    this.patientListPurpose = 'registration';
    this.activeRegistrationView = 'new-registration';
  }

  openExistingRegistration(visitId: number): void {
    this.selectedVisitId = visitId;
    this.billOpenMode = 'existing';
    this.patientListPurpose = 'registration';
    this.activeRegistrationView = 'new-registration';
  }

  handlePatientSelected(visitId: number): void {
    if (this.patientListPurpose === 'result') {
      this.openResultEntry(visitId);
      return;
    }

    this.openExistingRegistration(visitId);
  }

  openFromAdvanceSearch(payload: { visitId: number; openType: 'newBill' | 'existingBill' | 'patientResult' }): void {
    this.selectedVisitId = payload.visitId;
    if (payload.openType === 'patientResult') {
      this.activeRegistrationView = 'result-entry';
      return;
    }

    this.billOpenMode = payload.openType === 'newBill' ? 'prefill-only' : 'existing';
    this.patientListPurpose = 'registration';
    this.activeRegistrationView = 'new-registration';
  }

  closeRegistration(): void {
    this.patientListPurpose = 'registration';
    this.activeRegistrationView = null;
  }

  openPatientAdvanceSearch(): void {
    this.patientListPurpose = 'registration';
    this.activeRegistrationView = 'patient-advance-search';
  }

  openResultEntry(visitId: number): void {
    this.selectedVisitId = visitId;
    this.activeRegistrationView = 'result-entry';
  }

  closeCollectionSummary(): void {
    this.activeCollectionSummaryMode = null;
  }

  private openCollectionSummary(mode: 'daily' | 'monthly' | 'department-wise-daily' | 'department-wise-monthly', title: string): void {
    this.activeCollectionSummaryMode = mode;
    this.activeCollectionSummaryTitle = title;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('');
  }

  hasActionPermission(action: TopMenuAction): boolean {
    if (action === 'exit' || action === 'about-us' || action === 'our-features') {
      return true;
    }
    if (action === 'invoice-entry') return this.authService.hasPermission('invoice-entry');
    if (action === 'edit-invoice') return this.authService.hasPermission('edit-invoice');
    if (action === 'patient-advance-search') return this.authService.hasPermission('patient-advance-search');
    if (action === 'pending-collection') return this.authService.hasPermission('pending-collection');
    if (action === 'remove-report-authorization') return this.authService.hasPermission('remove-report-authorization');
    if (action === 'result-entry') return this.authService.hasPermission('result-entry');
    if (action === 'accounts-heads') return this.authService.hasPermission('accounts-heads');
    if (action === 'cash-payments') return this.authService.hasPermission('cash-payments');
    if (action === 'cash-receipts') return this.authService.hasPermission('cash-receipts');
    if (action === 'day-book') return this.authService.hasPermission('day-book');
    if (action === 'journal') return this.authService.hasPermission('journal');
    if (action === 'reagent-items') return this.authService.hasPermission('reagent-items');
    if (action === 'stock-inward') return this.authService.hasPermission('stock-inward');
    if (action === 'stock-outward') return this.authService.hasPermission('stock-outward');
    if (action === 'stock-report') return this.authService.hasPermission('stock-report');
    if (action === 'staff') return this.authService.hasPermission('user-management');
    
    if (action === 'daily-collection-statement') return this.authService.hasPermission('daily-collection-statement');
    if (action === 'collection-summary') return this.authService.hasPermission('collection-summary');
    if (action === 'daily-collection-summary-division-wise') return this.authService.hasPermission('daily-collection-summary-division-wise');
    if (action === 'monthly-collection-summary-division-wise') return this.authService.hasPermission('monthly-collection-summary-division-wise');

    const generalReportActions = [
      'credit-client-invoice-summary', 'credit-client-invoice', 'user-wise-collection', 
      'pending-register', 'pending-collection-register', 'result-register', 
      'cancelled-invoices', 'doctor-wise-invoices', 'hospital-wise-invoices', 
      'patient-wise-invoices', 'test-wise-invoices', 'sample-collection-wise-invoices', 
      'division-wise-invoices', 'test-performance', 'test-price-list', 
      'test-detailed', 'doctors', 'hospitals', 'patients', 'employees', 
      'departments', 'divisions', 'methods', 'units', 'technologies'
    ];
    if (generalReportActions.includes(action)) {
      return this.authService.hasPermission('general-reports');
    }

    const accountsReportActions = [
      'payments-statement', 'receipts-statement', 'income-expense-statement', 
      'other-income-expense-statement', 'ledger', 'cash-statement', 'bank-statement'
    ];
    if (accountsReportActions.includes(action)) {
      return this.authService.hasPermission('accounts-statements');
    }

    const masterSettingActions = [
      'test', 'department', 'unit', 'method', 'technologies', 'area', 'contacts', 
      'result-note-template', 'doctor', 'hospital', 'patient', 'customer', 
      'discount-reason', 'set-test-order', 'set-group-test', 'set-hospital-collection', 
      'set-customize-1', 'set-customize-2', 'set-customize-3', 'set-special-rate', 
      'set-sms-template', 'set-discount-percentage', 'set-result-template', 'set-culture'
    ];
    if (masterSettingActions.includes(action)) {
      return this.authService.hasPermission('master-settings');
    }

    return false;
  }

  hasMenuGroupPermission(menuKey: TopMenuKey): boolean {
    if (menuKey === 'help') return true;
    const menu = this.dropdownMenus.find((m) => m.key === menuKey);
    if (!menu) return false;
    return menu.items.some((item) => this.hasActionPermission(item.action));
  }

  hasSidebarItemPermission(item: string): boolean {
    if (item === 'About us' || item === 'Log off') return true;
    if (item === 'Lab registration') return this.authService.hasPermission('invoice-entry');
    if (item === 'Result entry') return this.authService.hasPermission('result-entry');
    if (item === 'Pending Collection') return this.authService.hasPermission('pending-collection');
    if (item === 'Patient Adv. Search') return this.authService.hasPermission('patient-advance-search');
    return false;
  }
}

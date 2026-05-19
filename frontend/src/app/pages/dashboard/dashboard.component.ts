import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BillRegistrationComponent } from '../lab-registration/bill-registration/bill-registration.component';
import { PatientListComponent } from '../lab-registration/patient-list/patient-list.component';
import { PatientAdvanceSearchComponent } from '../patient-advance-search/patient-advance-search.component';
import { AuthService, LoginSession } from '../../services/auth.service';
import { ClockService } from '../../services/clock.service';

type EntryAction =
  | 'invoice-entry'
  | 'edit-invoice'
  | 'patient-advance-search'
  | 'pending-collection'
  | 'pending-collection-group-wise'
  | 'result-entry'
  | 'remove-report-authorization'
  | 'exit';

type TopMenuKey = 'entries' | 'accounts' | 'master-settings' | 'reports' | 'help';

type TopMenuAction =
  | EntryAction
  | 'accounts-heads'
  | 'cash-payments'
  | 'cash-receipts'
  | 'day-book'
  | 'journal'
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
  imports: [CommonModule, DatePipe, PatientListComponent, BillRegistrationComponent, PatientAdvanceSearchComponent],
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
        { label: 'Pending Collection (Group wise)', action: 'pending-collection-group-wise', badge: 'G' },
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
        { label: 'Staff', action: 'staff', badge: 'S' },
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
  activeRegistrationView: 'patients' | 'new-registration' | 'patient-advance-search' | null = null;
  selectedVisitId: number | null = null;
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

  handleMenuClick(item: string): void {
    if (item === 'Lab registration') {
      this.activeRegistrationView = 'patients';
      return;
    }

    if (item === 'Patient Adv. Search') {
      this.activeRegistrationView = 'patient-advance-search';
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
      this.activeRegistrationView = 'patients';
      return;
    }

    if (action === 'patient-advance-search') {
      this.activeRegistrationView = 'patient-advance-search';
      return;
    }

    if (action === 'exit') {
      this.logout();
    }
  }

  openNewRegistration(): void {
    this.selectedVisitId = null;
    this.activeRegistrationView = 'new-registration';
  }

  openExistingRegistration(visitId: number): void {
    this.selectedVisitId = visitId;
    this.activeRegistrationView = 'new-registration';
  }

  closeRegistration(): void {
    this.activeRegistrationView = null;
  }

  openPatientAdvanceSearch(): void {
    this.activeRegistrationView = 'patient-advance-search';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('');
  }
}

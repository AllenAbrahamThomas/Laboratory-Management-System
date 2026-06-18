import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountsService, LabUser } from '../../../services/accounts.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css'
})
export class UserManagementComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly accountsService = inject(AccountsService);
  private readonly authService = inject(AuthService);

  users: LabUser[] = [];
  selectedUserId: number | null = null;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Current logged in user info
  currentUserRole = 'staff';
  currentUsername = '';

  // Form fields
  showForm = false;
  formMode: 'add' | 'edit' = 'add';
  formUsername = '';
  formPassword = '';
  formRole: 'admin' | 'supervisor' | 'staff' = 'staff';
  formIsActive = true;
  formPermissions: string[] = [];

  readonly permissionGroups = [
    {
      name: 'Billing & Registration',
      perms: [
        { value: 'invoice-entry', label: 'Invoice Entry/Registration' },
        { value: 'edit-invoice', label: 'Edit Invoice' },
        { value: 'patient-advance-search', label: 'Patient Adv. Search' },
        { value: 'pending-collection', label: 'Pending Collection' },
        { value: 'bill-cancellation', label: 'Bill Cancellation' }


      ]
    },
    {
      name: 'Result Entry',
      perms: [
        { value: 'result-entry', label: 'Result Entry' }
      ]
    },
    {
      name: 'Accounts',
      perms: [
        { value: 'accounts-heads', label: 'Accounts Heads' },
        { value: 'cash-payments', label: 'Cash Payments' },
        { value: 'cash-receipts', label: 'Cash Receipts' },
        { value: 'day-book', label: 'Day Book' },
        { value: 'journal', label: 'Journal' }
      ]
    },
    {
      name: 'Stock Management',
      perms: [
        { value: 'reagent-items', label: 'Reagent Items' },
        { value: 'stock-inward', label: 'Stock Inward' },
        { value: 'stock-outward', label: 'Stock Outward' },
        { value: 'stock-report', label: 'Stock Report' }
      ]
    },
    {
      name: 'Reports & Statements',
      perms: [
        { value: 'daily-collection-statement', label: 'Daily Collection Statement' },
        { value: 'collection-summary', label: 'Monthly Collection Summary' },
        { value: 'daily-collection-summary-division-wise', label: 'Dept-wise Daily Collection' },
        { value: 'monthly-collection-summary-division-wise', label: 'Dept-wise Monthly Collection' },
        { value: 'general-reports', label: 'General Reports' },
        { value: 'accounts-statements', label: 'Accounts Statements' }
      ]
    },
    {
      name: 'System Config',
      perms: [
        { value: 'master-settings', label: 'Master Settings' },
        { value: 'user-management', label: 'User Management' }
      ]
    }
  ];

  ngOnInit(): void {
    const session = this.authService.activeSession;
    if (session) {
      this.currentUserRole = session.user_group;
      this.currentUsername = session.username;
    }
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.accountsService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load users. You might not have permission.';
        this.isLoading = false;
      }
    });
  }

  selectUser(id: number): void {
    this.selectedUserId = id;
    const user = this.users.find(u => u.id === id);
    if (user) {
      this.formMode = 'edit';
      this.formUsername = user.username;
      this.formPassword = ''; // blank means unchanged
      this.formRole = user.role;
      this.formIsActive = user.is_active;
      this.formPermissions = [...user.permissions];
      this.showForm = true;
      this.successMessage = '';
      this.errorMessage = '';
    }
  }

  openAdd(): void {
    this.selectedUserId = null;
    this.formMode = 'add';
    this.formUsername = '';
    this.formPassword = '';
    this.formRole = 'staff';
    this.formIsActive = true;
    // Set default permissions for new users (billing and results as confirmed)
    this.formPermissions = [
      'invoice-entry', 'edit-invoice', 'patient-advance-search', 
      'pending-collection', 'result-entry'
    ];
    this.showForm = true;
    this.successMessage = '';
    this.errorMessage = '';
  }

  closeForm(): void {
    this.showForm = false;
    this.selectedUserId = null;
  }

  isPermissionChecked(value: string): boolean {
    if (this.formRole === 'admin') return true; // admin gets all checked
    return this.formPermissions.includes(value);
  }

  togglePermission(value: string, event: Event): void {
    if (this.formRole === 'admin') return; // cannot change admin permissions

    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      if (!this.formPermissions.includes(value)) {
        this.formPermissions.push(value);
      }
    } else {
      this.formPermissions = this.formPermissions.filter(p => p !== value);
    }
  }

  saveUser(): void {
    if (!this.formUsername.trim()) {
      this.errorMessage = 'Username is required.';
      return;
    }

    if (this.formMode === 'add' && !this.formPassword) {
      this.errorMessage = 'Password is required for new users.';
      return;
    }

    const payload: LabUser = {
      username: this.formUsername.trim(),
      role: this.formRole,
      is_active: this.formIsActive,
      permissions: this.formRole === 'admin' ? [] : this.formPermissions
    };

    if (this.formPassword) {
      payload.password = this.formPassword;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    if (this.formMode === 'add') {
      this.accountsService.createUser(payload).subscribe({
        next: () => {
          this.loadUsers();
          this.showForm = false;
          this.successMessage = 'User created successfully.';
          this.isLoading = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.detail || err.error?.username?.[0] || 'Failed to create user.';
          this.isLoading = false;
        }
      });
    } else {
      if (this.selectedUserId === null) return;
      this.accountsService.updateUser(this.selectedUserId, payload).subscribe({
        next: () => {
          this.loadUsers();
          this.showForm = false;
          this.successMessage = 'User updated successfully.';
          this.isLoading = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.detail || 'Failed to update user.';
          this.isLoading = false;
        }
      });
    }
  }

  deleteUser(): void {
    if (this.selectedUserId === null) return;
    const user = this.users.find(u => u.id === this.selectedUserId);
    if (!user) return;

    if (user.username === 'admin') {
      this.errorMessage = 'Cannot delete default admin user.';
      return;
    }

    if (!confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.accountsService.deleteUser(this.selectedUserId).subscribe({
      next: () => {
        this.loadUsers();
        this.showForm = false;
        this.successMessage = 'User deleted successfully.';
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || 'Failed to delete user.';
        this.isLoading = false;
      }
    });
  }
}

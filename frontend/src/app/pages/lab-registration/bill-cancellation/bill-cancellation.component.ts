import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VisitService } from '../../../services/visit.service';
import { AuthService } from '../../../services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-bill-cancellation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bill-cancellation.component.html',
  styleUrl: './bill-cancellation.component.css'
})
export class BillCancellationComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly visitService = inject(VisitService);
  private readonly authService = inject(AuthService);

  searchLabNo = '';
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Invoice details
  visitDetails: any = null;
  cancelReason = '';

  // Current user info
  currentUserRole = 'staff';

  ngOnInit(): void {
    const session = this.authService.activeSession;
    if (session) {
      this.currentUserRole = session.user_group;
    }
  }

  canCancel(): boolean {
    return this.currentUserRole === 'admin' || this.currentUserRole === 'supervisor';
  }

  canRevoke(): boolean {
    return this.currentUserRole === 'admin';
  }

  onInvoiceNumberChange(): void {
    const labNo = this.searchLabNo.trim();
    if (!labNo) {
      this.visitDetails = null;
      this.cancelReason = '';
      this.errorMessage = '';
      this.successMessage = '';
      return;
    }

    // Quietly lookup as they type
    this.visitService.cancelLookup(labNo).subscribe({
      next: (data) => {
        this.visitDetails = data;
        this.errorMessage = '';
        this.successMessage = '';
      },
      error: () => {
        // Clear details quietly if it doesn't exist
        this.visitDetails = null;
      }
    });
  }

  lookupInvoice(): void {
    const labNo = this.searchLabNo.trim();
    if (!labNo) {
      this.errorMessage = 'Please enter an invoice number.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.visitDetails = null;
    this.cancelReason = '';

    this.visitService.cancelLookup(labNo).subscribe({
      next: (data) => {
        this.visitDetails = data;
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.status === 404
          ? 'Invoice not found.'
          : error.error?.detail || 'Failed to lookup invoice details.';
        this.isLoading = false;
      }
    });
  }

  cancelBill(): void {
    if (!this.visitDetails) return;
    const reason = this.cancelReason.trim();
    if (!reason) {
      this.errorMessage = 'Cancellation reason is required.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.visitService.cancelVisit(this.visitDetails.id, reason).subscribe({
      next: (res) => {
        this.successMessage = 'Invoice cancelled successfully.';
        this.visitDetails.status = 'cancelled';
        this.visitDetails.cancel_reason = reason;
        this.visitDetails.cancelled_by = this.authService.activeSession?.username || '';
        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.error?.detail || 'Failed to cancel invoice.';
        this.isLoading = false;
      }
    });
  }

  revokeCancellation(): void {
    if (!this.visitDetails) return;
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.visitService.revokeCancelVisit(this.visitDetails.id).subscribe({
      next: (res) => {
        this.successMessage = 'Invoice cancellation revoked successfully.';
        this.lookupInvoice();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = error.error?.detail || 'Failed to revoke cancellation.';
        this.isLoading = false;
      }
    });
  }
}

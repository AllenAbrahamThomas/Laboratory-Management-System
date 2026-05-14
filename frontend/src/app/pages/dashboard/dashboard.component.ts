import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BillRegistrationComponent } from '../lab-registration/bill-registration/bill-registration.component';
import { PatientListComponent } from '../lab-registration/patient-list/patient-list.component';
import { AuthService, LoginSession } from '../../services/auth.service';
import { ClockService } from '../../services/clock.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe, PatientListComponent, BillRegistrationComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentTime$ = inject(ClockService).currentTime$;
  activeSession: LoginSession | null = null;
  activeRegistrationView: 'patients' | 'new-registration' | null = null;

  readonly menuItems = [
    'Lab registration',
    'Result entry',
    'Pending Collection',
    'Patient Adv. Search',
    'Envelope',
    'Calculator',
    'Log off',
    'About us',
    'Exit',
  ];

  ngOnInit(): void {
    this.activeSession = this.authService.activeSession;

    if (!this.activeSession) {
      this.router.navigateByUrl('');
    }
  }

  handleMenuClick(item: string): void {
    if (item === 'Lab registration') {
      this.activeRegistrationView = 'patients';
      return;
    }

    if (item === 'Log off') {
      this.logout();
    }
  }

  openNewRegistration(): void {
    this.activeRegistrationView = 'new-registration';
  }

  closeRegistration(): void {
    this.activeRegistrationView = null;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('');
  }
}

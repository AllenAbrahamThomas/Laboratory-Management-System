import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, LoginSession } from '../../services/auth.service';
import { ClockService } from '../../services/clock.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly currentTime$ = inject(ClockService).currentTime$;
  activeSession: LoginSession | null = null;

  readonly menuItems = [
    'Lab registration',
    'Result entry',
    'Pending Collection',
    'Patient Adv. Search',
    'Log off',
    'About us',
  ];

  ngOnInit(): void {
    this.activeSession = this.authService.activeSession;

    if (!this.activeSession) {
      this.router.navigateByUrl('');
    }
  }

  handleMenuClick(item: string): void {
    if (item === 'Log off') {
      this.logout();
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('');
  }
}

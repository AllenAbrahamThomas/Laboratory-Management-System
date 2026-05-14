import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ClockService } from '../../services/clock.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly currentTime$ = inject(ClockService).currentTime$;

  username = '';
  password = '';
  isSubmitting = false;
  errorMessage = '';

  login(): void {
    this.errorMessage = '';
    const username = this.username.trim();

    if (!username) {
      this.errorMessage = 'Enter user name.';
      return;
    }

    this.isSubmitting = true;
    this.authService.login(username, this.password).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.router.navigateByUrl('/dashboard');
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = this.authService.getLoginErrorMessage(error);
        this.isSubmitting = false;
      }
    });
  }

  reset(): void {
    this.username = '';
    this.password = '';
    this.errorMessage = '';
  }
}

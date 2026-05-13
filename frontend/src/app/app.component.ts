import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

interface LoginSession {
  id: number;
  username: string;
  user_group: string;
  login_at: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private timerId?: number;

  readonly apiUrl = 'http://localhost:8000/api';
  currentTime = new Date();
  username = '';
  password = '';
  isSubmitting = false;
  errorMessage = '';
  activeSession?: LoginSession;

  readonly menuItems = [
    'Lab registration',
    'Result entry',
    'Pending Collection',
    'Patient Adv. Search',
    'Envelope',
    'Calculator',
    'Log off',
    'About us',
    'Exit'
  ];

  ngOnInit(): void {
    this.timerId = window.setInterval(() => {
      this.currentTime = new Date();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      window.clearInterval(this.timerId);
    }
  }

  login(): void {
    this.errorMessage = '';
    if (!this.username.trim()) {
      this.errorMessage = 'Enter user name.';
      return;
    }

    this.isSubmitting = true;
    this.http.post<LoginSession>(`${this.apiUrl}/login/`, {
      username: this.username,
      user_group: '',
      password: this.password
    }).subscribe({
      next: (session) => {
        this.activeSession = session;
        this.isSubmitting = false;
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 400) {
          this.errorMessage = 'Invalid username or password.';
        } else {
          this.errorMessage = 'Unable to save login time. Check that the backend is running.';
        }
        this.isSubmitting = false;
      }
    });
  }

  logout(): void {
    this.activeSession = undefined;
    this.password = '';
  }
}

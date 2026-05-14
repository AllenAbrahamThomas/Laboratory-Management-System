import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export interface LoginSession {
  id: number;
  username: string;
  user_group: string;
  login_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8000/api';
  private readonly activeSessionSubject = new BehaviorSubject<LoginSession | null>(null);

  readonly activeSession$ = this.activeSessionSubject.asObservable();

  get activeSession(): LoginSession | null {
    return this.activeSessionSubject.value;
  }

  login(username: string, password: string): Observable<LoginSession> {
    return this.http.post<LoginSession>(`${this.apiUrl}/login/`, {
      username,
      user_group: '',
      password
    }).pipe(
      tap((session) => this.activeSessionSubject.next(session))
    );
  }

  logout(): void {
    this.activeSessionSubject.next(null);
  }

  getLoginErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'Invalid username or password.';
    }

    return 'Unable to save login time. Check that the backend is running.';
  }
}

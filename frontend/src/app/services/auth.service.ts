import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export interface LoginSession {
  id: number;
  username: string;
  user_group: string;
  token: string;
  permissions: string[];
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

  private readonly lastActivityKey = 'lab_last_activity';
  private readonly inactivityLimit = 4 * 60 * 60 * 1000; // 4 hours in ms

  constructor() {
    const savedSession = localStorage.getItem('lab_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        const lastActivity = localStorage.getItem(this.lastActivityKey);
        const now = Date.now();
        if (lastActivity && now - parseInt(lastActivity, 10) > this.inactivityLimit) {
          this.logout();
        } else {
          this.activeSessionSubject.next(session);
          this.updateActivity();
        }
      } catch (e) {
        this.logout();
      }
    }

    if (typeof window !== 'undefined') {
      const events = ['click', 'keydown', 'mousemove', 'scroll'];
      events.forEach(event => {
        window.addEventListener(event, () => this.updateActivity());
      });
      // Periodically check inactivity every minute
      setInterval(() => this.checkInactivity(), 60000);
    }
  }

  get activeSession(): LoginSession | null {
    return this.activeSessionSubject.value;
  }

  login(username: string, password: string): Observable<LoginSession> {
    return this.http.post<LoginSession>(`${this.apiUrl}/login/`, {
      username,
      user_group: '',
      password
    }).pipe(
      tap((session) => {
        localStorage.setItem('lab_session', JSON.stringify(session));
        this.activeSessionSubject.next(session);
        this.updateActivity();
      })
    );
  }

  lookupRole(username: string): Observable<{ role: string }> {
    return this.http.get<{ role: string }>(`${this.apiUrl}/users/role-lookup/`, {
      params: { username }
    });
  }


  logout(): void {
    localStorage.removeItem('lab_session');
    localStorage.removeItem(this.lastActivityKey);
    this.activeSessionSubject.next(null);
  }

  hasPermission(permission: string): boolean {
    const session = this.activeSession;
    if (!session) return false;
    if (session.user_group === 'admin') return true;
    return session.permissions ? session.permissions.includes(permission) : false;
  }

  updateActivity(): void {
    if (this.activeSession) {
      localStorage.setItem(this.lastActivityKey, Date.now().toString());
    }
  }

  checkInactivity(): void {
    if (this.activeSession) {
      const lastActivity = localStorage.getItem(this.lastActivityKey);
      const now = Date.now();
      if (lastActivity && now - parseInt(lastActivity, 10) > this.inactivityLimit) {
        this.logout();
      }
    }
  }

  getLoginErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) {
      return 'Invalid username or password.';
    }

    return 'Unable to save login time. Check that the backend is running.';
  }
}


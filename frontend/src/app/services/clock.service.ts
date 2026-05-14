import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ClockService implements OnDestroy {
  private readonly currentTimeSubject = new BehaviorSubject<Date>(new Date());
  private readonly timerId = window.setInterval(() => {
    this.currentTimeSubject.next(new Date());
  }, 1000);

  readonly currentTime$ = this.currentTimeSubject.asObservable();

  ngOnDestroy(): void {
    window.clearInterval(this.timerId);
  }
}

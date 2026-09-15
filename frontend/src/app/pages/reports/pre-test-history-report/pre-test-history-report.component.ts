import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VisitService } from '../../../services/visit.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-pre-test-history-report',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './pre-test-history-report.component.html',
  styleUrl: './pre-test-history-report.component.css'
})
export class PreTestHistoryReportComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly visitService = inject(VisitService);
  readonly authService = inject(AuthService);

  reportDate = '';
  isLoading = false;
  errorMessage = '';
  reportData: any[] = [];
  readonly todayDate = new Date();

  ngOnInit(): void {
    this.reportDate = this.getTodayDate();
    this.loadReport();
  }

  loadReport(): void {
    if (!this.reportDate) {
      this.errorMessage = 'Please select a date.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.reportData = [];

    this.visitService.getPreTestHistoryReport(this.reportDate).subscribe({
      next: (data) => {
        this.reportData = data;
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = 'Unable to load Pre-Test History report.';
        this.isLoading = false;
      }
    });
  }

  printReport(): void {
    window.print();
  }

  private getTodayDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

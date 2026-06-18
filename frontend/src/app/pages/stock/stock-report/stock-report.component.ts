import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { StockService, StockReportResponse } from '../../../services/stock.service';

@Component({
  selector: 'app-stock-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stock-report.component.html',
  styleUrl: './stock-report.component.css'
})
export class StockReportComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly stockService = inject(StockService);

  report: StockReportResponse | null = null;
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadReport();
  }

  loadReport(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.stockService.getStockReport().subscribe({
      next: (data) => {
        this.report = data;
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load Stock Report.';
        this.isLoading = false;
      }
    });
  }

  printReport(): void {
    if (!this.report) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const lowStockRows = this.report.low_stock.map(item => {
      let stockStr = '';
      if (item.reagent_type === 'liquid') {
        stockStr = `${item.quantity_in_stock} bottle${item.quantity_in_stock !== 1 ? 's' : ''} (${item.quantity} ml)`;
        if (item.quantity_in_use) {
          stockStr += `<br><span style="font-size: 10px; color: #555; font-weight: normal;">In Use: ${item.quantity_in_use} bottle${item.quantity_in_use !== 1 ? 's' : ''}</span>`;
        }
      } else {
        stockStr = `${item.quantity} ${item.unit}`;
      }
      const minStr = `${item.min_level} ${item.reagent_type === 'liquid' ? 'ml' : item.unit}`;
      return `
        <tr>
          <td style="padding: 6px; border: 1px solid #ccc;">${item.code || '-'}</td>
          <td style="padding: 6px; border: 1px solid #ccc;">${item.name}</td>
          <td style="padding: 6px; border: 1px solid #ccc; text-align: right;">${stockStr}</td>
          <td style="padding: 6px; border: 1px solid #ccc; text-align: right;">${minStr}</td>
          <td style="padding: 6px; border: 1px solid #ccc; color: red; font-weight: bold;">CRITICAL</td>
        </tr>
      `;
    }).join('');

    const expiredRows = this.report.expired.map(item => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.reagent_name}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.batch_no || '-'}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.expiry_date}</td>
        <td style="padding: 6px; border: 1px solid #ccc; text-align: right;">${item.quantity}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.supplier || '-'}</td>
      </tr>
    `).join('');

    const expiringRows = this.report.expiring_soon.map(item => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.reagent_name}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.batch_no || '-'}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.expiry_date}</td>
        <td style="padding: 6px; border: 1px solid #ccc; text-align: right;">${item.quantity}</td>
        <td style="padding: 6px; border: 1px solid #ccc;">${item.supplier || '-'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Alert Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; font-size: 12px; color: #000; }
            h2, h3 { text-align: center; margin: 5px 0; }
            .section-title { font-weight: bold; font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #000; padding-bottom: 3px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
            th { background: #f2f2f2; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <h2>NEETHI CLINICAL LAB</h2>
          <h3>Inventory Audit & Stock Alert Report</h3>
          <p>Generated on: ${new Date().toLocaleDateString()}</p>

          <div class="section-title" style="color: red;">LOW STOCK / RE-ORDER LEVEL ALERTS</div>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Item Name</th>
                <th>Current Stock</th>
                <th>Min Level</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${lowStockRows || '<tr><td colspan="5" style="text-align:center;">No low stock alerts.</td></tr>'}
            </tbody>
          </table>

          <div class="section-title" style="color: darkred;">EXPIRED BATCHES</div>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Batch No</th>
                <th>Expiry Date</th>
                <th>Batch Quantity</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              ${expiredRows || '<tr><td colspan="5" style="text-align:center;">No expired batches.</td></tr>'}
            </tbody>
          </table>

          <div class="section-title" style="color: orange;">EXPIRING WITHIN 30 DAYS</div>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Batch No</th>
                <th>Expiry Date</th>
                <th>Batch Quantity</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              ${expiringRows || '<tr><td colspan="5" style="text-align:center;">No batches expiring soon.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
}

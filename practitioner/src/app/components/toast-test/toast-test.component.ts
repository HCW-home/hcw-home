import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-test',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px;">
      <h2>Toast Notification Demo</h2>
      
      <div style="display: flex; gap: 10px; margin: 20px 0;">
        <button style="padding: 8px 16px;" (click)="showSuccess()">Show Success</button>
        <button style="padding: 8px 16px;" (click)="showError()">Show Error</button>
        <button style="padding: 8px 16px;" (click)="showWarning()">Show Warning</button>
      </div>
    </div>
  `
})
export class ToastTestComponent {
  constructor(private toastService: ToastService) {}

  showSuccess() {
    this.toastService.show('Operation completed successfully', 'success');
  }

  showError() {
    this.toastService.show('An error occurred', 'error');
  }

  showWarning() {
    this.toastService.show('Please review before proceeding', 'warning');
  }
} 
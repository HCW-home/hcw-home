import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-test',
  standalone: true,
  imports: [CommonModule, IonicModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>
          Toast Notification Demo
        </ion-title>
      </ion-toolbar>
    </ion-header>
    
    <ion-content class="ion-padding">
      <h2>Toast Notification Examples</h2>
      
      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0;">
        <ion-button (click)="showSuccess()">Show Success</ion-button>
        <ion-button color="danger" (click)="showError()">Show Error</ion-button>
        <ion-button color="warning" (click)="showWarning()">Show Warning</ion-button>
      </div>
    </ion-content>
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
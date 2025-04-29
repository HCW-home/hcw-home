import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="toastService.toast$ | async as toast" class="toast" [ngClass]="toast.type">
      <div class="toast-content">
        <span class="toast-icon">
          <i *ngIf="toast.type === 'success'" class="fas fa-check-circle"></i>
          <i *ngIf="toast.type === 'error'" class="fas fa-times-circle"></i>
          <i *ngIf="toast.type === 'warning'" class="fas fa-exclamation-triangle"></i>
        </span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
      <button class="toast-close" (click)="toastService.hide()">×</button>
    </div>
  `,
  styleUrls: ['./toast.component.scss']
})
export class ToastComponent {
  constructor(public toastService: ToastService) {}
}

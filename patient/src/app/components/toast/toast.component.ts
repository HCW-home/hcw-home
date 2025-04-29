import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, IonicModule],
  template: `
    <div *ngIf="toastService.toast$ | async as toast" class="toast" [ngClass]="toast.type">
      <div class="toast-content">
        <ion-icon *ngIf="toast.type === 'success'" name="checkmark-circle"></ion-icon>
        <ion-icon *ngIf="toast.type === 'error'" name="close-circle"></ion-icon>
        <ion-icon *ngIf="toast.type === 'warning'" name="warning"></ion-icon>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
      <ion-button fill="clear" size="small" class="toast-close" (click)="toastService.hide()">
        <ion-icon name="close"></ion-icon>
      </ion-button>
    </div>
  `,
  styles: [`
    .toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      min-width: 250px;
      max-width: 80%;
      padding: 1rem;
      border-radius: 8px;
      color: #fff;
      font-size: 1rem;
      z-index: 1000;
      opacity: 0.95;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: all 0.3s;
      display: flex;
      justify-content: space-between;
      align-items: center;
      animation: slide-in 0.3s ease-out;
    }
    
    .toast-content {
      display: flex;
      align-items: center;
      flex-grow: 1;
      gap: 10px;
    }
    
    .toast-message {
      font-weight: 500;
    }
    
    .toast-close {
      --padding-start: 0;
      --padding-end: 0;
      height: 20px;
      color: inherit;
      margin: 0;
    }
    
    .toast.success { background: var(--ion-color-success); }
    .toast.error { background: var(--ion-color-danger); }
    .toast.warning { background: var(--ion-color-warning); color: var(--ion-color-dark); }
    
    @keyframes slide-in {
      from {
        transform: translate(-50%, 100%);
        opacity: 0;
      }
      to {
        transform: translate(-50%, 0);
        opacity: 0.95;
      }
    }
  `]
})
export class ToastComponent {
  constructor(public toastService: ToastService) {}
} 
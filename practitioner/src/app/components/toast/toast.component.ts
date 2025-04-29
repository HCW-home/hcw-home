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
          <i *ngIf="toast.type === 'success'" class="fa fa-check-circle"></i>
          <i *ngIf="toast.type === 'error'" class="fa fa-times-circle"></i>
          <i *ngIf="toast.type === 'warning'" class="fa fa-exclamation-triangle"></i>
        </span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
      <button class="toast-close" (click)="toastService.hide()">×</button>
    </div>
  `,
  styles: [`
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      min-width: 250px;
      max-width: 400px;
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
    }
    
    .toast-icon {
      margin-right: 10px;
    }
    
    .toast-message {
      font-weight: 500;
    }
    
    .toast-close {
      background: none;
      border: none;
      color: inherit;
      font-size: 1.5rem;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
      padding: 0;
      margin-left: 10px;
      line-height: 1;
    }
    
    .toast-close:hover {
      opacity: 1;
    }
    
    .toast.success { background: #43a047; }
    .toast.error { background: #e53935; }
    .toast.warning { background: #ffa000; color: #333; }
    
    @keyframes slide-in {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 0.95;
      }
    }
  `]
})
export class ToastComponent {
  constructor(public toastService: ToastService) {}
} 
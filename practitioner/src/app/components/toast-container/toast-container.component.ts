// src/app/components/toast-container/toast-container.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { ToastService, ToastMessage, ToastType } from '../../services/toast/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-container.component.html',
  styleUrls: ['./toast-container.component.scss'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class ToastContainerComponent {
  constructor(public toast: ToastService) { }

  onAction(msg: ToastMessage): void {
    try {
      if (msg.action?.callback) {
        msg.action.callback();
      }
      this.toast.removeMessage(msg.id);
    } catch (e) {
      console.warn('Toast action failed', e);
    }
  }

  closeToast(id: string): void {
    this.toast.removeMessage(id);
  }

  formatTime(timestamp: Date): string {
    return timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getProgressDuration(type: ToastType): number {
    const durations = {
      [ToastType.SUCCESS]: 3000,
      [ToastType.ERROR]: 5000,
      [ToastType.INFO]: 4000,
      [ToastType.WARNING]: 4500
    };
    return durations[type] || 4000;
  }

  trackToast(index: number, toast: ToastMessage): string {
    return toast.id;
  }
}

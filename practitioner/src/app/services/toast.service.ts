import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  text: string;
  type?: ToastType;
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private toastSubject = new Subject<ToastMessage>();

  toasts$: Observable<ToastMessage> = this.toastSubject.asObservable();

  show(text: string, options?: { type?: ToastType; duration?: number }) {
    const toast: ToastMessage = {
      text,
      type: options?.type || 'info',
      duration: options?.duration || 3000,
    };
    this.toastSubject.next(toast);
  }

  success(text: string, duration?: number) {
    this.show(text, { type: 'success', duration });
  }

  error(text: string, duration?: number) {
    this.show(text, { type: 'error', duration });
  }

  info(text: string, duration?: number) {
    this.show(text, { type: 'info', duration });
  }

  warning(text: string, duration?: number) {
    this.show(text, { type: 'warning', duration });
  }
}

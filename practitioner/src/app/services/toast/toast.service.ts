
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export enum ToastType {
  SUCCESS = 'success',
  ERROR = 'error',
  INFO = 'info',
  WARNING = 'warning'
}

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  timestamp: Date;
  action?: {
    label: string;
    callback?: () => void;
  } | null;
}

const DEFAULT_DURATION = {
  SUCCESS: 3000,
  ERROR: 5000,
  INFO: 4000,
  WARNING: 4500
} as const;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _messages = new BehaviorSubject<ToastMessage[]>([]);
  readonly messages$ = this._messages.asObservable();

  show(
    message: string,
    durationMs: number = DEFAULT_DURATION.INFO,
    type: ToastType = ToastType.INFO,
    action: { label: string; callback?: () => void } | null = null,
  ): void {
    const toastMessage: ToastMessage = {
      id: this.generateId(),
      message,
      type,
      timestamp: new Date(),
      action,
    };

    const current = this._messages.getValue();
    this._messages.next([...current, toastMessage]);

    setTimeout(() => {
      this.removeMessage(toastMessage.id);
    }, durationMs);
  }

  showSuccess(message: string, duration?: number): void {
    this.show(message, duration ?? DEFAULT_DURATION.SUCCESS, ToastType.SUCCESS);
  }

  showError(message: string, duration?: number): void {
    this.show(message, duration ?? DEFAULT_DURATION.ERROR, ToastType.ERROR);
  }

  showWarning(message: string, duration?: number): void {
    this.show(message, duration ?? DEFAULT_DURATION.WARNING, ToastType.WARNING);
  }

  showInfo(message: string, duration?: number): void {
    this.show(message, duration ?? DEFAULT_DURATION.INFO, ToastType.INFO);
  }

  // Professional action-based toast methods
  showSuccessWithAction(
    message: string,
    actionLabel: string,
    actionCallback: () => void,
    duration?: number
  ): void {
    this.show(
      message,
      duration ?? DEFAULT_DURATION.SUCCESS,
      ToastType.SUCCESS,
      { label: actionLabel, callback: actionCallback }
    );
  }

  showErrorWithRetry(
    message: string,
    retryCallback: () => void,
    duration?: number
  ): void {
    this.show(
      message,
      duration ?? DEFAULT_DURATION.ERROR,
      ToastType.ERROR,
      { label: 'Retry', callback: retryCallback }
    );
  }

  showWarningWithAction(
    message: string,
    actionLabel: string,
    actionCallback: () => void,
    duration?: number
  ): void {
    this.show(
      message,
      duration ?? DEFAULT_DURATION.WARNING,
      ToastType.WARNING,
      { label: actionLabel, callback: actionCallback }
    );
  }

  // Professional system notifications
  notifySuccess(operation: string, entity?: string): void {
    const message = entity
      ? `${entity} ${operation} successfully`
      : `${operation} completed successfully`;
    this.showSuccess(message);
  }

  notifyError(operation: string, entity?: string, error?: string): void {
    const baseMessage = entity
      ? `Failed to ${operation} ${entity}`
      : `${operation} failed`;
    const message = error ? `${baseMessage}: ${error}` : baseMessage;
    this.showError(message);
  }

  notifyWarning(message: string, actionLabel?: string, actionCallback?: () => void): void {
    if (actionLabel && actionCallback) {
      this.showWarningWithAction(message, actionLabel, actionCallback);
    } else {
      this.showWarning(message);
    }
  }

  notifyInfo(message: string, actionLabel?: string, actionCallback?: () => void): void {
    if (actionLabel && actionCallback) {
      this.show(
        message,
        DEFAULT_DURATION.INFO,
        ToastType.INFO,
        { label: actionLabel, callback: actionCallback }
      );
    } else {
      this.showInfo(message);
    }
  }

  removeMessage(id: string): void {
    const current = this._messages.getValue();
    const filtered = current.filter(msg => msg.id !== id);
    this._messages.next(filtered);
  }

  clearAll(): void {
    this._messages.next([]);
  }

  private generateId(): string {
    return `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

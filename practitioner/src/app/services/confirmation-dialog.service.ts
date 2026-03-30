import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ConfirmationDialog {
  id: string;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  resolve: (result: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmationDialogService {
  private readonly _dialogs = new BehaviorSubject<ConfirmationDialog[]>([]);
  readonly dialogs$ = this._dialogs.asObservable();

  confirm(
    message: string,
    title: string = 'Confirm Action',
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel',
    type: 'info' | 'warning' | 'danger' | 'success' = 'warning'
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog: ConfirmationDialog = {
        id: this.generateId(),
        title,
        message,
        confirmText,
        cancelText,
        type,
        resolve
      };

      const current = this._dialogs.getValue();
      this._dialogs.next([...current, dialog]);
    });
  }

  confirmDanger(
    message: string,
    title: string = 'Confirm Deletion',
    confirmText: string = 'Delete',
    cancelText: string = 'Cancel'
  ): Promise<boolean> {
    return this.confirm(message, title, confirmText, cancelText, 'danger');
  }

  confirmWarning(
    message: string,
    title: string = 'Warning',
    confirmText: string = 'Continue',
    cancelText: string = 'Cancel'
  ): Promise<boolean> {
    return this.confirm(message, title, confirmText, cancelText, 'warning');
  }

  confirmInfo(
    message: string,
    title: string = 'Information',
    confirmText: string = 'OK',
    cancelText: string = 'Cancel'
  ): Promise<boolean> {
    return this.confirm(message, title, confirmText, cancelText, 'info');
  }

  resolve(id: string, result: boolean): void {
    const current = this._dialogs.getValue();
    const dialog = current.find(d => d.id === id);

    if (dialog) {
      dialog.resolve(result);
      this.removeDialog(id);
    }
  }

  removeDialog(id: string): void {
    const current = this._dialogs.getValue();
    const filtered = current.filter(d => d.id !== id);
    this._dialogs.next(filtered);
  }

  private generateId(): string {
    return `dialog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

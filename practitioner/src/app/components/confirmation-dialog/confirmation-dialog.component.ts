import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationDialogService, ConfirmationDialog } from '../../services/confirmation-dialog.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-dialog.component.html',
  styleUrls: ['./confirmation-dialog.component.scss']
})
export class ConfirmationDialogComponent implements OnInit, OnDestroy {
  dialogs: ConfirmationDialog[] = [];
  private destroy$ = new Subject<void>();

  constructor(private confirmationService: ConfirmationDialogService) { }

  ngOnInit(): void {
    this.confirmationService.dialogs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(dialogs => {
        this.dialogs = dialogs;
        // Prevent body scroll when dialog is open
        if (dialogs.length > 0) {
          document.body.classList.add('modal-open');
        } else {
          document.body.classList.remove('modal-open');
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.body.classList.remove('modal-open');
  }

  onConfirm(id: string): void {
    this.confirmationService.resolve(id, true);
  }

  onCancel(id: string): void {
    this.confirmationService.resolve(id, false);
  }

  onOverlayClick(id: string): void {
    // Close dialog when clicking overlay
    this.onCancel(id);
  }

  trackDialog(index: number, dialog: ConfirmationDialog): string {
    return dialog.id;
  }
}

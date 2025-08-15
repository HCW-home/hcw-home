import { Component, Input, Output, EventEmitter, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationHistoryItem } from '../../models/consultations/consultation.model';
import { ConsultationHistoryService } from '../../services/consultations/consultation-history.service';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { ButtonVariant, ButtonSize } from '../../constants/button.enums';
import { SvgIconComponent } from '../../shared/components/svg-icon.component';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-consultation-history-card',
  standalone: true,
  imports: [CommonModule, ButtonComponent, SvgIconComponent],
  templateUrl: './consultation-history-card.component.html',
  styleUrls: ['./consultation-history-card.component.scss'],
})
export class ConsultationHistoryCardComponent {
  consultation = input.required<ConsultationHistoryItem>();
  isSelected = input<boolean>(false);
  @Output() cardClick = new EventEmitter<number>();
  @Output() sendInvitation = new EventEmitter<number>();
  @Output() moreActions = new EventEmitter<number>();
  downloadingPdf = false;
  downloadError: string | null = null;

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  constructor(
    private consultationService: ConsultationHistoryService,
    private userService: UserService
  ) {}

  onCardClick(): void {
    this.cardClick.emit(this.consultation().consultation.id);
  }

  onSendInvitationClick(event: Event): void {
    event.stopPropagation();
    this.sendInvitation.emit(this.consultation().consultation.id);
  }

  onExportClick(event: Event): void {
    event.stopPropagation();
    this.downloadPDF(this.consultation().consultation.id);
  }

  onMoreActionsClick(event: Event): void {
    event.stopPropagation();
    this.cardClick.emit(this.consultation().consultation.id);
  }

  downloadPDF(consultationId: number): void {
    if (this.downloadingPdf) return;

    this.downloadingPdf = true;
    this.clearDownloadError();

    this.userService.getCurrentUser().subscribe({
      next: (user) => {
        const requesterId = user.id;
        
        this.consultationService
          .downloadAndSavePDF(consultationId, requesterId)
          .subscribe({
            next: () => {
              this.downloadingPdf = false;
            },
            error: (error) => {
              this.downloadingPdf = false;
              this.downloadError = error.message || 'Failed to download PDF report';
              console.error('PDF download error:', error);
            },
          });
      },
      error: (error) => {
        this.downloadingPdf = false;
        this.downloadError = 'Failed to get user information';
        console.error('Error getting current user:', error);
      }
    });
  }

  clearDownloadError(): void {
    this.downloadError = null;
  }

  getPatientDisplayName(): string {
    const patient = this.consultation().patient;

    const consultationAge =
      Date.now() - (this.consultation().consultation.closedAt?.getTime() || 0);
    const retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds

    if (consultationAge > retentionPeriod) {
      return `Patient ${this.consultation().consultation.id}`;
    }

    return `${patient.firstName} ${patient.lastName}`;
  }

  formatDateTime(date?: Date | null): string {
    if (!date) {
      return '—';
    }
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  formatDate(date?: Date | null): string {
    if (!date) {
      return '—';
    }
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
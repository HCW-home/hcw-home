import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationHistoryItem } from '../../models/consultations/consultation.model';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { ButtonVariant, ButtonSize } from '../../constants/button.enums';

@Component({
  selector: 'app-consultation-history-card',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './consultation-history-card.component.html',
  styleUrls: ['./consultation-history-card.component.scss'],
})
export class ConsultationHistoryCardComponent {
  @Input() consultation!: ConsultationHistoryItem;
  @Input() isSelected = false;
  @Output() cardClick = new EventEmitter<number>();
  @Output() downloadPDF = new EventEmitter<number>();
  @Output() sendInvitation = new EventEmitter<number>();
  @Output() exportData = new EventEmitter<number>();
  @Output() moreActions = new EventEmitter<number>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  onCardClick(): void {
    this.cardClick.emit(this.consultation.consultation.id);
  }

  onDownloadClick(event: Event): void {
    event.stopPropagation();
    this.downloadPDF.emit(this.consultation.consultation.id);
  }

  onSendInvitationClick(event: Event): void {
    event.stopPropagation();
    this.sendInvitation.emit(this.consultation.consultation.id);
  }

  onExportClick(event: Event): void {
    event.stopPropagation();
    this.exportData.emit(this.consultation.consultation.id);
  }

  onMoreActionsClick(event: Event): void {
    event.stopPropagation();
    this.cardClick.emit(this.consultation.consultation.id);
  }

  getPatientDisplayName(): string {
    const patient = this.consultation.patient;

    const consultationAge =
      Date.now() - (this.consultation.consultation.closedAt?.getTime() || 0);
    const retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds

    if (consultationAge > retentionPeriod) {
      return `Patient ${this.consultation.consultation.id}`;
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

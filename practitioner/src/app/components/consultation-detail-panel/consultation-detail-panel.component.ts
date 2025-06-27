import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationDetail } from '../../models/consultations/consultation.model';
import { ConsultationHistoryService } from '../../services/consultations/consultation-history.service';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { ButtonVariant, ButtonSize } from '../../constants/button.enums';
import { SvgIconComponent } from '../../shared/components/svg-icon.component';

@Component({
  selector: 'app-consultation-detail-panel',
  standalone: true,
  imports: [CommonModule, ButtonComponent, SvgIconComponent],
  templateUrl: './consultation-detail-panel.component.html',
  styleUrls: ['./consultation-detail-panel.component.scss'],
})
export class ConsultationDetailPanelComponent implements OnChanges {
  consultationId = input<number | null>(null);
  isOpen = input<boolean>(false);
  @Output() close = new EventEmitter<void>();
  @Output() downloadPDF = new EventEmitter<number>();

  consultationDetail: ConsultationDetail | null = null;
  loading = false;
  error: string | null = null;

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  constructor(private consultationService: ConsultationHistoryService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['consultationId'] && this.consultationId() && this.isOpen()) {
      this.loadConsultationDetail();
    }
  }

  loadConsultationDetail(): void {
    if (!this.consultationId()) return;

    this.loading = true;
    this.error = null;

    this.consultationService
      .getConsultationDetail(this.consultationId()!)
      .subscribe({
        next: (detail) => {
          this.consultationDetail = detail;
          this.loading = false;
        },
        error: (error) => {
          this.error = 'Failed to load consultation details';
          this.loading = false;
          console.error('Error loading consultation detail:', error);
        },
      });
  }

  onClose(): void {
    this.close.emit();
  }

  onDownloadPDF(): void {
    if (this.consultationId()) {
      this.downloadPDF.emit(this.consultationId()!);
    }
  }

  formatDate(date: Date | null): string {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  formatMessageTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  getParticipantName(userId: number): string {
    const participant = this.consultationDetail?.participants.find(
      (p) => p.userId === userId
    );
    if (!participant) return 'Unknown User';

    return `User ${userId}`;
  }
}

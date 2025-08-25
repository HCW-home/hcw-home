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
import { UserService } from '../../services/user.service';

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
  

  downloadingPdf = false;
  downloadError: string | null = null;

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  constructor(
    private consultationService: ConsultationHistoryService,
    private userService: UserService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['consultationId'] && this.consultationId() && this.isOpen()) {
      this.loadConsultationDetail();
    }
    
    if (changes['isOpen'] && !this.isOpen()) {
      this.clearDownloadError();
    }
  }

  loadConsultationDetail(): void {
    if (!this.consultationId()) return;

    this.loading = true;
    this.error = null;
    this.clearDownloadError();

    this.consultationService
      .getConsultationDetail(this.consultationId()!)
      .subscribe({
        next: (detail) => {
          this.consultationDetail = detail;
          this.loading = false;
        },
        error: (error) => {
          this.error = error.message || 'Failed to load consultation details';
          this.loading = false;
          console.error('Error loading consultation detail:', error);
        },
      });
  }

  onClose(): void {
    this.close.emit();
  }

  onDownloadPDF(): void {
    if (!this.consultationId() || this.downloadingPdf) return;

    this.downloadingPdf = true;
    this.clearDownloadError();

    this.userService.getCurrentUser().subscribe({
      next: (user) => {
        const requesterId = user.id;
        
        this.consultationService
          .downloadAndSavePDF(this.consultationId()!, requesterId)
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

  formatDate(date: Date | null): string {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(date));
  }

  formatMessageTime(date: Date | string): string {
    const messageDate = new Date(date);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(messageDate);
  }

  getParticipantName(userId: number): string {
    if (!this.consultationDetail) return 'Unknown User';
    
    const participant = this.consultationDetail.participants?.find(
      (p) => p.userId === userId
    );
    
    if (!participant) {
      if (this.consultationDetail.patient.id === userId) {
        return `${this.consultationDetail.patient.firstName} ${this.consultationDetail.patient.lastName}`;
      }
      return `User ${userId}`;
    }

    return `User ${userId}`; 
  }

  getParticipantInitials(userId: number): string {
    if (!this.consultationDetail) return '??';
    
    if (this.consultationDetail.patient.id === userId) {
      const firstName = this.consultationDetail.patient.firstName || '';
      const lastName = this.consultationDetail.patient.lastName || '';
      return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || '??';
    }
    return ''; 
  }

  getPatientInitials(): string {
    if (!this.consultationDetail?.patient) return '??';
    
    const firstName = this.consultationDetail.patient.firstName || '';
    const lastName = this.consultationDetail.patient.lastName || '';
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || '??';
  }
}
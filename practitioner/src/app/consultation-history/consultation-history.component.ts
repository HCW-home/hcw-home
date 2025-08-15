import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationHistoryItem } from '../models/consultations/consultation.model';
import { ConsultationHistoryService } from '../services/consultations/consultation-history.service';
import { ConsultationHistoryCardComponent } from '../components/consultation-history-card/consultation-history-card.component';
import { ConsultationDetailPanelComponent } from '../components/consultation-detail-panel/consultation-detail-panel.component';
import { ButtonComponent } from '../components/ui/button/button.component';
import { ButtonVariant, ButtonSize } from '../constants/button.enums';
import { HttpClientModule } from '@angular/common/http';
import { OverlayComponent } from '../components/overlay/overlay.component';
import { UserService } from '../services/user.service';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-consultation-history',
  standalone: true,
  imports: [
    CommonModule,
    ConsultationHistoryCardComponent,
    ConsultationDetailPanelComponent,
    OverlayComponent,
    ButtonComponent,
    HttpClientModule,
  ],
  templateUrl: './consultation-history.component.html',
  styleUrls: ['./consultation-history.component.scss'],
})
export class ConsultationHistoryComponent implements OnInit {
  consultations: ConsultationHistoryItem[] = [];
  loading = false;
  error: string | null = null;

  selectedConsultationId: number | null = null;
  isDetailPanelOpen = false;

  currentPage = 1;
  pageSize = 10;
  totalPages = 0;

  downloadingPdfIds = new Set<number>();
  downloadErrors = new Map<number, string>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  private practitionerId: number | null = null;

  constructor(
    private consultationService: ConsultationHistoryService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.loadConsultations();
  }

  loadConsultations(): void {
    this.loading = true;
    this.error = null;

    this.userService.getCurrentUser()
      .pipe(
        switchMap(user => {
          this.practitionerId = user.id;
          return this.consultationService.getClosedConsultations(user.id);
        })
      )
      .subscribe({
        next: (consultations) => {
          this.consultations = consultations;
          this.initializePagination();
          this.loading = false;
        },
        error: (error) => {
          this.error = error.message || 'Failed to load consultation history';
          this.loading = false;
          console.error('Error loading consultations:', error);
        },
      });
  }

  private initializePagination(): void {
    this.totalPages = Math.ceil(this.consultations.length / this.pageSize);
    this.currentPage = 1;
  }

  get paginatedConsultations(): ConsultationHistoryItem[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.consultations.slice(start, end);
  }

  onCardClick(consultationId: number): void {
    this.selectedConsultationId = consultationId;
    this.isDetailPanelOpen = true;
  }

  onDetailPanelClose(): void {
    this.isDetailPanelOpen = false;
    this.selectedConsultationId = null;
  }

  onDownloadPDF(consultationId: number | Event): void {
    const id = typeof consultationId === 'number' ? consultationId : Number(consultationId);
    if (this.downloadingPdfIds.has(id)) {
      return;
    }

    if (!this.practitionerId) {
      this.showErrorMessage('User information not available');
      return;
    }

    this.downloadErrors.delete(id);
    this.downloadingPdfIds.add(id);
    
    const consultation = this.consultations.find(c => c.consultation.id === id);
    const patientName = consultation?.patient 
      ? `${consultation.patient.firstName}-${consultation.patient.lastName}`.replace(/\s+/g, '-')
      : 'unknown-patient';
    const customFilename = `consultation-${id}-${patientName}-${new Date().toISOString().split('T')[0]}.pdf`;
    
    this.consultationService
      .downloadAndSavePDF(id, this.practitionerId, customFilename)
      .subscribe({
        next: () => {
          this.downloadingPdfIds.delete(id);
          this.showSuccessMessage(`PDF report downloaded successfully`);
        },
        error: (error) => {
          this.downloadingPdfIds.delete(id);
          const errorMessage = error.message || 'Failed to download PDF report';
          this.downloadErrors.set(id, errorMessage);
          this.showErrorMessage(errorMessage);
          console.error('PDF download error:', error);
        },
      });
  }

  isDownloadingPDF(consultationId: number): boolean {
    return this.downloadingPdfIds.has(consultationId);
  }

  getDownloadError(consultationId: number): string | undefined {
    return this.downloadErrors.get(consultationId);
  }

  clearDownloadError(consultationId: number): void {
    this.downloadErrors.delete(consultationId);
  }

  private showSuccessMessage(message: string): void {
    console.log('Success:', message);
  }

  private showErrorMessage(message: string): void {
    console.error('Error:', message);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  downloadAllVisible(): void {
    const visibleConsultations = this.paginatedConsultations;
    
    if (visibleConsultations.length === 0) {
      this.showErrorMessage('No consultations available to download');
      return;
    }

    const confirmMessage = `Download PDF reports for all ${visibleConsultations.length} consultations on this page?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    visibleConsultations.forEach((consultation, index) => {
      setTimeout(() => {
        this.onDownloadPDF(consultation.consultation.id);
      }, index * 500); 
    });
  }

  downloadAll(): void {
    if (this.consultations.length === 0) {
      this.showErrorMessage('No consultations available to download');
      return;
    }

    const confirmMessage = `Download PDF reports for all ${this.consultations.length} consultations? This may take several minutes.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    this.consultations.forEach((consultation, index) => {
      setTimeout(() => {
        this.onDownloadPDF(consultation.consultation.id);
      }, index * 1000);
    });
  }
}
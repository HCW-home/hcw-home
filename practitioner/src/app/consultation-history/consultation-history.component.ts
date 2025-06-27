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

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  private practitionerId = 2;

  constructor(private consultationService: ConsultationHistoryService) {}

  ngOnInit(): void {
    this.loadConsultations();
  }

  loadConsultations(): void {
    this.loading = true;
    this.error = null;

    this.consultationService
      .getClosedConsultations(this.practitionerId)
      .subscribe({
        next: (consultations) => {
          this.consultations = consultations;
          this.initializePagination();
          this.loading = false;
        },
        error: (error) => {
          this.error = 'Failed to load consultation history';
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

  onDownloadPDF(consultationId: number): void {
    this.consultationService.downloadConsultationPDF(consultationId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `consultation-${consultationId}-report.pdf`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Error downloading PDF:', error);
      },
    });
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
}

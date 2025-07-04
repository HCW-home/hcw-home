import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import {
  OpenConsultationService,
} from '../services/consultations/open-consultation.service';
import { OpenConsultation } from '../dtos/consultations/open-consultation.dto';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../components/ui/button/button.component';
import { ButtonVariant, ButtonSize } from '../constants/button.enums';
import { OpenConsultationCardComponent } from '../components/open-consultation-card/open-consultation-card.component';
import { OpenConsultationPanelComponent } from '../components/open-consultation-panel/open-consultation-panel.component';
import { OverlayComponent } from '../components/overlay/overlay.component';

@Component({
  selector: 'app-open-consultations',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    OpenConsultationCardComponent,
    OpenConsultationPanelComponent,
    OverlayComponent,
  ],
  templateUrl: './open-consultations.component.html',
  styleUrls: ['./open-consultations.component.scss'],
})
export class OpenConsultationsComponent implements OnInit, OnDestroy {
  consultations: OpenConsultation[] = [];
  selectedConsultation: OpenConsultation | null = null;
  isLoading: boolean = false;
  currentPage: number = 1;
  totalPages: number = 1;
  totalConsultations: number = 0;
  showRightPanel: boolean = false;

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  private destroy$ = new Subject<void>();

  constructor(
    private openConsultationService: OpenConsultationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadConsultations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadConsultations(): void {
    this.isLoading = true;
    this.openConsultationService
      .getOpenConsultations(this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.consultations = response.consultations;
          this.totalConsultations = response.total;
          this.currentPage = response.currentPage;
          this.totalPages = response.totalPages;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading consultations:', error);
          this.isLoading = false;
        },
      });
  }

  onConsultationClick(consultation: OpenConsultation): void {
    console.log('Consultation clicked:', consultation);
    this.selectedConsultation = consultation;
    this.showRightPanel = true;
    this.cdr.detectChanges();
  }

  onSendInvitation(consultationId: number): void {
    this.openConsultationService
      .sendInvitation(consultationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            console.log('Invitation sent successfully');
            this.loadConsultations();
          }
        },
        error: (error) => {
          console.error('Error sending invitation:', error);
        },
      });
  }

  onJoinConsultation(consultationId: number): void {
    const practitionerId = 1; 
    this.openConsultationService
      .joinConsultation(consultationId, practitionerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.sessionUrl) {
            this.router.navigate([response.sessionUrl]);
          }
        },
        error: (error) => {
          console.error('Error joining consultation:', error);
        },
      });
  }

  onCloseConsultation(consultationId: number): void {
    if (confirm('Are you sure you want to close this consultation?')) {
      const practitionerId = 1; 
      this.openConsultationService
        .closeConsultation(consultationId, practitionerId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.loadConsultations();
              this.closeRightPanel();
            }
          },
          error: (error) => {
            console.error('Error closing consultation:', error);
          },
        });
    }
  }

  closeRightPanel(): void {
    this.showRightPanel = false;
    this.selectedConsultation = null;
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadConsultations();
    }
  }

  getPaginationPages(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(
      1,
      this.currentPage - Math.floor(maxVisiblePages / 2)
    );
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, takeUntil, switchMap } from 'rxjs';
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
import { UserService } from '../services/user.service';
import { DashboardWebSocketService } from '../services/dashboard-websocket.service';
import { ToastService, ToastType } from '../services/toast/toast.service';
import { ConfirmationDialogService } from '../services/confirmation-dialog.service';

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
  get dedupedConsultations(): OpenConsultation[] {
    return this.consultations.filter(
      (c, i, arr) => arr.findIndex(x => x.id === c.id) === i
    );
  }
  trackByConsultationId(_idx: number, consultation: OpenConsultation): number {
    return consultation.id;
  }
  consultations: OpenConsultation[] = [];
  selectedConsultation: OpenConsultation | null = null;
  isLoading: boolean = false;
  currentPage: number = 1;
  totalPages: number = 1;
  totalConsultations: number = 0;
  showRightPanel: boolean = false;
  showInviteForm: boolean = false;
  inviteFormData: any = null;

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  private destroy$ = new Subject<void>();
  private practitionerId: number | null = null;

  constructor(
    private openConsultationService: OpenConsultationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private userService: UserService,
    private dashboardWebSocketService: DashboardWebSocketService,
    private toastService: ToastService,
    private confirmationService: ConfirmationDialogService
  ) { }

  ngOnInit(): void {
    this.loadConsultations();
    this.setupWebSocketListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupWebSocketListeners(): void {
    // Listen for consultation status updates
    this.dashboardWebSocketService.patientJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification) => {
        // Refresh consultations when patient joins
        this.loadConsultations();
      });

    // Listen for dashboard state changes that might affect consultations
    this.dashboardWebSocketService.dashboardState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        if (state.hasNewNotifications) {
          this.loadConsultations();
        }
      });
  }

  loadConsultations(): void {
    this.isLoading = true;

    this.userService.getCurrentUser()
      .pipe(
        switchMap(user => {
          this.practitionerId = user.id;
          return this.openConsultationService.getOpenConsultations(user.id, this.currentPage);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          console.log('🔍 [Open Consultations] Raw response:', response.consultations.length, 'consultations');
          const filtered = response.consultations.filter(c =>
            c.status !== 'COMPLETED' && c.status !== 'CANCELLED'
          );
          console.log('🔍 [Open Consultations] After status filter:', filtered.length);
          this.consultations = filtered.filter(
            (c, i, arr) => arr.findIndex(x => x.id === c.id) === i
          );
          console.log('🔍 [Open Consultations] After dedup in loadConsultations:', this.consultations.length);
          console.log('🔍 [Open Consultations] dedupedConsultations getter:', this.dedupedConsultations.length);
          console.log('🔍 [Open Consultations] Consultation IDs:', this.consultations.map(c => c.id));
          this.totalConsultations = this.dedupedConsultations.length;
          this.currentPage = response.currentPage;
          this.totalPages = response.totalPages;
          this.isLoading = false;
        },
        error: (error) => {
          this.toastService.show('Failed to load consultations', 5000, ToastType.ERROR);
          this.isLoading = false;
        },
      });
  }

  onConsultationClick(consultation: OpenConsultation): void {
    this.selectedConsultation = consultation;
    this.showRightPanel = true;
    this.cdr.detectChanges();
  }

  onSendInvitation(consultationId: number): void {
    // Find the consultation to pre-fill the form
    const consultation = this.consultations.find(c => c.id === consultationId);
    if (!consultation) return;

    // Prepare pre-filled data
    this.inviteFormData = {
      firstName: consultation.patient.firstName,
      lastName: consultation.patient.lastName,
      gender: consultation.patient.sex,
      language: 'English', // or fetch from consultation if available
      group: consultation.groupName || '',
      contact: '', // Fill with patient contact if available
      symptoms: consultation.lastMessage || '',
      // Add other fields as needed
    };
    this.showInviteForm = true;
  }

  onInviteFormSubmit(formData: any): void {
    this.showInviteForm = false;
    this.inviteFormData = null;
    this.toastService.show('Invitation sent successfully', 3000, ToastType.SUCCESS);
    this.loadConsultations();
  }

  onInviteFormClose(): void {
    this.showInviteForm = false;
    this.inviteFormData = null;
  }

  onJoinConsultation(consultationId: number): void {
    if (!this.practitionerId) {
      this.toastService.show('Practitioner ID not available', 4000, ToastType.ERROR);
      return;
    }

    const consultation = this.consultations.find(c => c.id === consultationId);
    if (!consultation) {
      this.toastService.show('Consultation not found', 4000, ToastType.ERROR);
      return;
    }

    if (consultation.status === 'COMPLETED') {
      this.toastService.show('Cannot join a completed consultation', 4000, ToastType.ERROR);
      return;
    }

    this.openConsultationService
      .joinConsultation(consultationId, this.practitionerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.router.navigate(['/consultation-room', consultationId], {
              queryParams: { practitionerId: this.practitionerId }
            });
          } else {
            this.toastService.show(response.message || 'Failed to join consultation', 4000, ToastType.ERROR);
          }
        },
        error: (error) => {
          const msg = error?.error?.message || error?.message || 'Error joining consultation';
          this.toastService.show(msg, 4000, ToastType.ERROR);
        },
      });
  }

  async onCloseConsultation(consultationId: number): Promise<void> {
    if (!this.practitionerId) {
      this.toastService.showError('Unable to close consultation: Practitioner ID not available');
      return;
    }

    const confirmed = await this.confirmationService.confirmDanger(
      'This action will permanently close the consultation. This cannot be undone.',
      'Close Consultation',
      'Close Consultation',
      'Cancel'
    );

    if (confirmed) {
      this.openConsultationService
        .closeConsultation(consultationId, this.practitionerId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.loadConsultations();
              this.closeRightPanel();
              this.toastService.notifySuccess('close', 'Consultation');
            } else {
              this.toastService.notifyError('close', 'consultation', response.message);
            }
          },
          error: (error) => {
            this.toastService.notifyError('close', 'consultation', 'An unexpected error occurred');
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

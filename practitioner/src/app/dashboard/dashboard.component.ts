import { Component, OnInit, computed, signal, OnDestroy } from '@angular/core';
// ...existing code...
import { UserService } from '../services/user.service';
import { ToastService } from '../services/toast/toast.service';
import { CommonModule } from '@angular/common';
import { ConsultationCardComponent } from '../components/consultations-card/consultations-card.component';
import { InviteFormComponent } from '../components/invite-form/invite-form.component';
import { RoutePaths } from '../constants/route-paths.enum';
import { ConsultationService, CreatePatientConsultationRequest } from '../services/consultations/consultation.service';
import { ConsultationWithPatient, WaitingRoomResponse } from '../dtos';
import { DashboardWebSocketService } from '../services/dashboard-websocket.service';
import { Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ConsultationCardComponent, InviteFormComponent, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  readonly RoutePaths = RoutePaths;

  waitingConsultations = signal<ConsultationWithPatient[]>([]);
  openConsultations = signal<ConsultationWithPatient[]>([]);
  isInviting = signal(false);
  isLoading = signal(false);

  waitingPatientCount = signal(0);
  hasNewNotifications = signal(false);
  isConnected = signal(false);

  audioEnabled = signal(true);
  audioVolume = signal(0.7);
  showAudioSettings = signal(false);

  constructor(
    private consultationService: ConsultationService,
    private dashboardWebSocketService: DashboardWebSocketService,
    private toastService: ToastService,
    private userService: UserService
  ) { }

  ngOnInit(): void {
    this.initializeDashboard();
    this.loadConsultations();
    this.loadAudioSettings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize dashboard with real-time features
   */
  private initializeDashboard(): void {
    this.userService.getCurrentUser().subscribe({
      next: (user) => {
        if (!user || !user.id) {
          this.toastService.showError('Practitioner ID not found. Please log in again.');
          return;
        }
        this.dashboardWebSocketService.initializeDashboardConnection(user.id);

        this.dashboardWebSocketService.dashboardState$
          .pipe(takeUntil(this.destroy$))
          .subscribe(state => {
            this.waitingPatientCount.set(state.waitingPatientCount);
            this.hasNewNotifications.set(state.hasNewNotifications);
            this.isConnected.set(state.isConnected);
          });

        // Subscribe to patient notifications
        this.dashboardWebSocketService.patientJoined$
          .pipe(takeUntil(this.destroy$))
          .subscribe(notification => {
            this.toastService.showInfo('New patient joined the waiting room.');
            this.loadConsultations();
          });
      },
      error: () => {
        this.toastService.showError('Unable to fetch practitioner info. Please log in again.');
      }
    });
  }

  private loadConsultations(): void {
    this.consultationService
      .getWaitingConsultations()
      .subscribe({
        next: (data) => {
          this.waitingConsultations.set(data.data || []);
        },
        error: (error: any) => {
          this.toastService.showError('Error fetching waiting consultations.');
        }
      });

    this.consultationService
      .getOpenConsultations()
      .subscribe({
        next: (data) => {
          this.openConsultations.set(data);
        },
        error: (error: any) => {
          this.toastService.showError('Error fetching open consultations.');
        }
      });
  }

  private mapToWaitingRoomResponse(consultations: ConsultationWithPatient[]): WaitingRoomResponse {
    return {
      success: true,
      statusCode: 200,
      message: 'Mapped consultations',
      waitingRooms: consultations.map(consultation => ({
        id: consultation.consultation.id,
        patientInitials: consultation.patient.initials,
        joinTime: consultation.consultation.startedAt ? new Date(consultation.consultation.startedAt) : null,
        language: 'English',
        queuePosition: 1,
        estimatedWaitTime: '5 mins',
        selected: false,
        reason: undefined,
      })),
      totalCount: consultations.length,
      currentPage: 1,
      totalPages: 1,
      timestamp: new Date().toISOString(),
    };
  }

  cards = computed(() => {
    const cards = [
      {
        title: 'WAITING ROOM',
        description: 'Consultations waiting to be attended',
        consultations: this.waitingConsultations(),
        routerLink: RoutePaths.WaitingRoom,
        showInvite: true,
        type: 'waiting',
        waitingData: this.waitingConsultations() ? this.mapToWaitingRoomResponse(this.waitingConsultations()) : null,
      },
      {
        title: 'CONSULTATION INVITES',
        description: 'Pending consultation invitations',
        consultations: [], // Will be populated with invite count from service
        routerLink: RoutePaths.Invitations,
        showInvite: false,
        type: 'invites',
        waitingData: null,
      },
      {
        title: 'OPEN CONSULTATIONS',
        description: 'Consultations in progress',
        consultations: this.openConsultations(),
        routerLink: RoutePaths.OpenConsultations,
        showInvite: false,
        type: 'open',
        waitingData: null,
      },
    ];
    return cards;
  });

  trackByTitle(_idx: number, card: { title: string }): string {
    return card.title;
  }

  onInviteSubmit(formData: CreatePatientConsultationRequest) {
    // Optionally show a toast for form submission (debug)

    this.isLoading.set(true);

    this.consultationService.createPatientAndConsultation(formData)
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          if (response.data && response.data.success) {
            const { patient, consultation } = response.data.data;
            if (patient.isNewPatient) {
              this.toastService.showSuccess(`New patient "${patient.firstName} ${patient.lastName}" created and consultation invitation sent!`);
            } else {
              this.toastService.showSuccess(`Consultation invitation sent to existing patient "${patient.firstName} ${patient.lastName}"!`);
            }
            this.closeInvite();
            // Since a new invitation was created, we don't need to refresh open consultations
            // The invitation will appear in the invites list instead
            this.toastService.showInfo('The consultation invitation is now available in the Invites section.');
          } else {
            this.toastService.showError('Failed to create consultation invitation.');
          }
        },
        error: (error) => {
          this.isLoading.set(false);
          let errorMessage = 'Failed to create patient and consultation invitation';
          if (error.error?.message) {
            errorMessage = error.error.message;
          } else if (error.message) {
            errorMessage = error.message;
          }
          this.toastService.showError(errorMessage);
        }
      });
  }

  openInviteSelector() {
    this.isInviting.set(true);
  }

  closeInvite() {
    this.isInviting.set(false);
  }

  /**
   * Load audio settings from dashboard service
   */
  private loadAudioSettings(): void {
    const config = this.dashboardWebSocketService.getAudioConfig();
    this.audioEnabled.set(config.enabled);
    this.audioVolume.set(config.volume);
  }

  /**
   * Toggle audio notifications
   */
  toggleAudio(): void {
    const newState = !this.audioEnabled();
    this.audioEnabled.set(newState);
    this.dashboardWebSocketService.setAudioEnabled(newState);
  }

  /**
   * Update audio volume
   */
  updateVolume(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);
    this.audioVolume.set(isNaN(value) ? 0 : value);
    this.dashboardWebSocketService.setAudioVolume(this.audioVolume());
  }

  /**
   * Test audio alerts
   */
  async testAudio(): Promise<void> {
    try {
      await this.dashboardWebSocketService.playTestAlert();
    } catch (error: any) {
      this.toastService.showError(error?.message || 'Audio test failed.');
    }
  }

  /**
   * Get practitioner ID from backend/auth service
   */
  // getPractitionerId removed: now uses UserService for actual business logic

  /**
   * Toggle audio settings panel
   */
  toggleAudioSettings(): void {
    this.showAudioSettings.set(!this.showAudioSettings());
  }

  /**
   * Mark notifications as read
   */
  markNotificationsAsRead(): void {
    this.dashboardWebSocketService.markNotificationsAsRead();
    this.hasNewNotifications.set(false);
  }

  /**
   * Get connection status text
   */
  getConnectionStatusText(): string {
    return this.isConnected() ? 'Connected' : 'Disconnected';
  }

  /**
   * Get waiting patients text
   */
  getWaitingPatientsText(): string {
    const count = this.waitingPatientCount();
    if (count === 0) return 'No patients waiting';
    if (count === 1) return '1 patient waiting';
    return `${count} patients waiting`;
  }
}

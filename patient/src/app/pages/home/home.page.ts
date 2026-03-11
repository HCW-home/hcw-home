import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  IonIcon,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  NavController,
  ToastController,
  AlertController
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ConsultationService } from '../../core/services/consultation.service';
import { UserWebSocketService } from '../../core/services/user-websocket.service';
import { User } from '../../core/models/user.model';
import { AppHeaderComponent } from '../../shared/app-header/app-header.component';
import { AppFooterComponent } from '../../shared/app-footer/app-footer.component';
import { ConsultationRequest, Consultation, Speciality, Appointment } from '../../core/models/consultation.model';
import { TranslationService } from '../../core/services/translation.service';
import { LocalDatePipe } from '../../shared/pipes/local-date.pipe';
import { AppointmentInfoComponent } from '../../shared/components/appointment-info/appointment-info';
import { ConsultationInfoComponent } from '../../shared/components/consultation-info/consultation-info';

interface RequestStatus {
  label: string;
  color: 'warning' | 'info' | 'primary' | 'success' | 'muted' | 'danger';
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    LocalDatePipe,
    IonIcon,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    AppHeaderComponent,
    AppFooterComponent,
    TranslatePipe,
    AppointmentInfoComponent,
    ConsultationInfoComponent,
  ]
})
export class HomePage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private t = inject(TranslationService);

  currentUser = signal<User | null>(null);
  hasReasons = signal(false);
  nextAppointment = signal<Appointment | null>(null);
  requests = signal<ConsultationRequest[]>([]);
  consultations = signal<Consultation[]>([]);
  appointments = signal<Appointment[]>([]);
  isLoading = signal(false);
  appointmentEarlyJoinMinutes = 5; // Default value
  highlightedRequestId = signal<number | null>(null);

  totalRequests = computed(() => this.requests().length);
  totalConsultations = computed(() => this.consultations().length);
  totalAppointments = computed(() => this.appointments().length);
  hasNoItems = computed(() => this.totalRequests() === 0 && this.totalConsultations() === 0 && this.totalAppointments() === 0);

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private authService: AuthService,
    private consultationService: ConsultationService,
    private toastController: ToastController,
    private alertController: AlertController,
    private userWsService: UserWebSocketService
  ) {}

  private async showError(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'danger'
    });
    await toast.present();
  }

  ngOnInit(): void {
    this.loadUserData();
    this.loadDashboard();
    this.listenToWebSocketChanges();
    this.loadConfig();
    this.handleQueryParams();
  }

  handleQueryParams(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const participantId = params['participantId'];
        const join = params['join'];
        const highlightRequest = params['highlightRequest'];

        if (highlightRequest) {
          this.highlightedRequestId.set(Number(highlightRequest));
          // Clear the highlight after 3 seconds
          setTimeout(() => {
            this.highlightedRequestId.set(null);
          }, 3000);
          // Clear query params to avoid re-triggering on refresh
          this.navCtrl.navigateRoot('/home', { replaceUrl: true });
        }

        if (participantId && join === 'true') {
          // Clear query params to avoid re-triggering
          this.navCtrl.navigateRoot('/home', { replaceUrl: true });

          // Fetch participant to get appointment ID
          this.consultationService.getParticipantById(Number(participantId))
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (participant) => {
                if (participant.appointment) {
                  this.tryJoinAppointment(participant.appointment);
                } else {
                  this.showError(this.t.instant('home.appointmentNotFound'));
                }
              },
              error: (error) => {
                this.showError(error?.error?.detail || this.t.instant('home.failedToLoadParticipant'));
              }
            });
        }
      });
  }

  loadConfig(): void {
    this.authService.getConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (config) => {
          if (config.appointment_early_join_minutes) {
            this.appointmentEarlyJoinMinutes = config.appointment_early_join_minutes;
          }
        },
        error: () => {
          // Use default value on error
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter(): void {
    this.loadDashboard();
  }

  loadUserData(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser.set(user);
      });
  }

  loadDashboard(): void {
    this.isLoading.set(true);
    this.refreshDashboard();
  }

  private refreshDashboard(): void {
    this.consultationService.getDashboard()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.hasReasons.set(response.has_reasons);
          this.nextAppointment.set(response.next_appointment);
          this.requests.set(response.requests);
          this.consultations.set(response.consultations);
          this.appointments.set(response.appointments);
          this.isLoading.set(false);
        },
        error: (error) => {
          this.showError(error?.error?.detail || this.t.instant('home.failedToLoad'));
          this.isLoading.set(false);
        }
      });
  }

  private listenToWebSocketChanges(): void {
    this.userWsService.appointmentChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshDashboard();
      });

    this.userWsService.consultationChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshDashboard();
      });
  }

  refreshData(event: { target: { complete: () => void } }): void {
    this.consultationService.getDashboard()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.hasReasons.set(response.has_reasons);
          this.nextAppointment.set(response.next_appointment);
          this.requests.set(response.requests);
          this.consultations.set(response.consultations);
          this.appointments.set(response.appointments);
          event.target.complete();
        },
        error: (error) => {
          this.showError(error?.error?.detail || this.t.instant('home.failedToLoad'));
          event.target.complete();
        }
      });
  }

  goToNewRequest(): void {
    this.navCtrl.navigateForward('/new-request');
  }

  getStatusConfig(status: string | undefined): RequestStatus {
    const normalizedStatus = (status || 'Requested').toLowerCase();
    const statusMap: Record<string, RequestStatus> = {
      'requested': { label: this.t.instant('home.statusPending'), color: 'warning' },
      'accepted': { label: this.t.instant('home.statusAccepted'), color: 'info' },
      'scheduled': { label: this.t.instant('home.statusScheduled'), color: 'primary' },
      'cancelled': { label: this.t.instant('home.statusCancelled'), color: 'danger' },
      'refused': { label: this.t.instant('home.statusRefused'), color: 'danger' }
    };
    return statusMap[normalizedStatus] || statusMap['requested'];
  }

  hasAppointment(request: ConsultationRequest): boolean {
    return !!request.appointment;
  }

  hasConsultation(request: ConsultationRequest): boolean {
    return !!request.consultation;
  }

  getReasonName(request: ConsultationRequest): string {
    if (typeof request.reason === 'object' && request.reason) {
      return request.reason.name;
    }
    return this.t.instant('home.consultation');
  }

  getSpecialityName(request: ConsultationRequest): string {
    if (typeof request.reason === 'object' && request.reason) {
      const speciality = request.reason.speciality;
      if (typeof speciality === 'object' && speciality) {
        return (speciality as Speciality).name;
      }
    }
    return '';
  }

  getDoctorName(request: ConsultationRequest): string {
    if (request.appointment?.participants) {
      const doctor = request.appointment.participants.find(p => p.user && p.user.id !== request.created_by?.id);
      if (doctor?.user) {
        return `${doctor.user.first_name} ${doctor.user.last_name}`;
      }
    }
    if (typeof request.expected_with === 'object' && request.expected_with) {
      const user = request.expected_with as { first_name?: string; last_name?: string };
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return '';
  }

  getAppointmentTypeIcon(request: ConsultationRequest): string {
    return request.appointment?.type === 'online' ? 'videocam-outline' : 'location-outline';
  }

  getAppointmentTypeLabel(request: ConsultationRequest): string {
    return request.appointment?.type === 'online' ? this.t.instant('common.video') : this.t.instant('common.inPerson');
  }

  isStatusRequested(request: ConsultationRequest): boolean {
    return request.status?.toLowerCase() === 'requested';
  }

  isStatusAccepted(request: ConsultationRequest): boolean {
    return request.status?.toLowerCase() === 'accepted';
  }

  isStatusRefused(request: ConsultationRequest): boolean {
    return request.status?.toLowerCase() === 'refused';
  }

  isStatusCancelled(request: ConsultationRequest): boolean {
    return request.status?.toLowerCase() === 'cancelled';
  }

  isRequestHighlighted(request: ConsultationRequest): boolean {
    const highlightId = this.highlightedRequestId();
    if (!highlightId) return false;
    const requestId = (request as any).pk ?? (request as any).id;
    return requestId === highlightId;
  }

  getConsultationDoctorName(consultation: Consultation): string {
    if (consultation.owned_by) {
      return `${consultation.owned_by.first_name} ${consultation.owned_by.last_name}`;
    }
    return '';
  }

  getConsultationReasonName(consultation: Consultation): string {
    if (consultation.title) {
      return consultation.title;
    }
    return this.t.instant('home.consultation');
  }

  viewConsultationDetails(consultation: Consultation): void {
    this.navCtrl.navigateForward(`/consultation/${consultation.id}`);
  }

  getConsultationStatusConfig(status: string): { label: string; color: 'warning' | 'info' | 'primary' | 'success' | 'muted' } {
    const normalizedStatus = (status || 'REQUESTED').toLowerCase();
    const statusMap: Record<string, { label: string; color: 'warning' | 'info' | 'primary' | 'success' | 'muted' }> = {
      'requested': { label: this.t.instant('home.statusRequested'), color: 'warning' },
      'active': { label: this.t.instant('home.statusActive'), color: 'success' },
      'closed': { label: this.t.instant('home.statusClosed'), color: 'muted' },
      'cancelled': { label: this.t.instant('home.statusCancelled'), color: 'muted' }
    };
    return statusMap[normalizedStatus] || statusMap['requested'];
  }

  getAppointmentStatusConfig(status: string): { label: string; color: 'warning' | 'info' | 'primary' | 'success' | 'muted' } {
    const normalizedStatus = (status || 'draft').toLowerCase();
    const statusMap: Record<string, { label: string; color: 'warning' | 'info' | 'primary' | 'success' | 'muted' }> = {
      'draft': { label: this.t.instant('home.statusDraft'), color: 'warning' },
      'scheduled': { label: this.t.instant('home.statusScheduled'), color: 'primary' },
      'cancelled': { label: this.t.instant('home.statusCancelled'), color: 'muted' }
    };
    return statusMap[normalizedStatus] || statusMap['draft'];
  }

  getAppointmentDoctorName(appointment: Appointment): string {
    const currentUserId = this.currentUser()?.id;
    if (appointment.participants) {
      const doctor = appointment.participants.find(p => p.user && p.user.id !== currentUserId);
      if (doctor?.user) {
        return `${doctor.user.first_name} ${doctor.user.last_name}`;
      }
    }
    return '';
  }

  getAppointmentIcon(appointment: Appointment): string {
    return appointment.type === 'online' ? 'videocam-outline' : 'location-outline';
  }

  getAppointmentTypeText(appointment: Appointment): string {
    return appointment.type === 'online' ? this.t.instant('common.video') : this.t.instant('common.inPerson');
  }


  getNextAppointmentDoctorName(): string {
    const appt = this.nextAppointment();
    if (!appt) return '';
    return this.getAppointmentDoctorName(appt);
  }

  joinNextAppointment(): void {
    const appt = this.nextAppointment();
    if (appt) {
      this.tryJoinAppointment(appt);
    }
  }

  viewConsultationFromRequest(request: ConsultationRequest): void {
    if (request.consultation?.id) {
      this.navCtrl.navigateForward(`/consultation/${request.consultation.id}`);
    }
  }

  joinAppointment(appointment: Appointment): void {
    this.tryJoinAppointment(appointment);
  }

  private async tryJoinAppointment(appointment: Appointment): Promise<void> {
    const now = new Date();
    const scheduledAt = new Date(appointment.scheduled_at);
    const earliestJoin = new Date(scheduledAt.getTime() - this.appointmentEarlyJoinMinutes * 60 * 1000);

    if (now < earliestJoin) {
      const time = scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const alert = await this.alertController.create({
        header: this.t.instant('home.tooEarlyTitle'),
        message: this.t.instant('home.tooEarlyMessage', { time, minutes: this.appointmentEarlyJoinMinutes.toString() }),
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    this.navCtrl.navigateForward(`/consultation/${appointment.consultation_id || 0}/video`, {
      queryParams: { appointmentId: appointment.id }
    });
  }
}

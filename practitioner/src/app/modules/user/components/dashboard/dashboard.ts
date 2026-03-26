import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { Page } from '../../../../core/components/page/page';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { Button } from '../../../../shared/ui-components/button/button';
import { Svg } from '../../../../shared/ui-components/svg/svg';
import { Loader } from '../../../../shared/components/loader/loader';
import { Badge } from '../../../../shared/components/badge/badge';
import { ConsultationRowItem } from '../../../../shared/components/consultation-row-item/consultation-row-item';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { BadgeTypeEnum } from '../../../../shared/constants/badge';
import {
  ButtonSizeEnum,
  ButtonStyleEnum,
} from '../../../../shared/constants/button';
import { ConsultationService } from '../../../../core/services/consultation.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { UserWebSocketService } from '../../../../core/services/user-websocket.service';
import {
  Consultation,
  Appointment,
  DashboardNextAppointment,
  AppointmentType,
  AppointmentStatus,
} from '../../../../core/models/consultation';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { getAppointmentBadgeType, parseDateWithoutTimezone } from '../../../../shared/tools/helper';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';
import { Auth } from '../../../../core/services/auth';
import { LocalDatePipe } from '../../../../shared/pipes/local-date.pipe';

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    Page,
    Typography,
    Button,
    Svg,
    Loader,
    Badge,
    ConsultationRowItem,
    TranslatePipe,
    LocalDatePipe,
  ],
  providers: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  animations: [
    trigger('listAnimation', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(-10px)' }),
          stagger(50, [
            animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ])
    ])
  ]
})
export class Dashboard implements OnInit, OnDestroy {
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private router = inject(Router);
  private t = inject(TranslationService);
  private datePipe = inject(DatePipe);
  private authService = inject(Auth);
  private userWsService = inject(UserWebSocketService);
  private destroy$ = new Subject<void>();

  loading = signal(true);
  error = signal<string | null>(null);

  nextAppointment = signal<DashboardNextAppointment | null>(null);
  upcomingAppointments = signal<Appointment[]>([]);
  overdueConsultations = signal<Consultation[]>([]);
  overdueTotal = signal(0);

  tooEarlyError = signal<{ appointmentId: number; time: string; minutes: number } | null>(null);
  appointmentEarlyJoinMinutes = 5; // Default value

  protected readonly getAppointmentBadgeType = getAppointmentBadgeType;
  protected readonly BadgeTypeEnum = BadgeTypeEnum;

  hasValidNextAppointment(): boolean {
    const apt = this.nextAppointment();
    return apt !== null && apt.scheduled_at !== null;
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly AppointmentType = AppointmentType;

  ngOnInit(): void {
    this.loadConfig();
    this.loadDashboardData();
    this.setupWebSocketListeners();
  }

  private setupWebSocketListeners(): void {
    this.userWsService.consultationEvent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadDashboardData(true);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadConfig(): void {
    this.authService.getOpenIDConfig()
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

  loadDashboardData(silent = false): void {
    if (!silent) {
      this.loading.set(true);
    }
    this.error.set(null);

    this.consultationService
      .getDashboard()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.nextAppointment.set(data.next_appointment);
          this.upcomingAppointments.set(data.upcoming_appointments || []);
          this.overdueConsultations.set(data.overdue_consultations || []);
          this.overdueTotal.set(data.overdue_total || 0);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(this.t.instant('dashboard.failedToLoad'));
          this.toasterService.show(
            'error',
            this.t.instant('dashboard.errorLoading'),
            getErrorMessage(err)
          );
          this.loading.set(false);
        },
      });
  }

  getAppointmentTypeLabel(type: AppointmentType | string): string {
    const tp = typeof type === 'string' ? type.toLowerCase() : type;
    switch (tp) {
      case 'online':
      case AppointmentType.ONLINE:
        return this.t.instant('dashboard.videoCall');
      case 'inperson':
      case 'in_person':
      case AppointmentType.INPERSON:
        return this.t.instant('dashboard.inPerson');
      default:
        return String(type);
    }
  }

  formatDate(dateStr: string): string {
    return this.datePipe.transform(dateStr, 'MMM d, yyyy') || '';
  }

  formatDateTime(dateStr: string): string {
    return this.datePipe.transform(dateStr, 'MMM d, h:mm a') || '';
  }

  formatTime(dateStr: string): string {
    return this.datePipe.transform(dateStr, 'h:mm a') || '';
  }

  getRelativeTime(dateStr: string): string {
    const date = parseDateWithoutTimezone(dateStr) || new Date(dateStr);
    const now = new Date();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((targetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      return this.t.instant('dashboard.inDays', { count: String(diffDays) });
    } else if (diffDays === 1) {
      return this.t.instant('dashboard.tomorrow');
    }

    const diffMs = date.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours > 0) {
      return this.t.instant('dashboard.inHours', { count: String(diffHours) });
    } else if (diffMinutes > 0) {
      return this.t.instant('dashboard.soon');
    } else {
      return this.t.instant('dashboard.now');
    }
  }

  navigateToConsultations(): void {
    this.router.navigate(['/app/consultations']);
  }

  navigateToOverdueConsultations(): void {
    this.router.navigate(['/app/consultations'], { fragment: 'overdue' });
  }

  navigateToAppointments(): void {
    this.router.navigate(['/app/appointments']);
  }

  navigateToNewConsultation(): void {
    this.router.navigate(['/app/consultations/new']);
  }

  navigateToAvailability(): void {
    this.router.navigate(['/app/availability']);
  }

  formatConsultationId(id: number): string {
    return `#${String(id).padStart(6, '0')}`;
  }

  navigateToSystemTest(): void {
    this.router.navigate(['/app/profile'], { fragment: 'system-test' });
  }

  viewConsultation(consultation: Consultation): void {
    this.router.navigate(['/app/consultations', consultation.id]);
  }

  isOnlineAppointment(type: AppointmentType | string | null): boolean {
    if (!type) return false;
    const t = typeof type === 'string' ? type.toLowerCase() : type;
    return t === 'online' || t === AppointmentType.ONLINE;
  }

  viewAppointment(appointment: Appointment): void {
    if (appointment.consultation_id) {
      this.router.navigate(['/app/consultations', appointment.consultation_id], {
        queryParams: { appointmentId: appointment.id },
      });
    } else {
      this.router.navigate(['/app/appointments'], {
        queryParams: { appointmentId: appointment.id },
      });
    }
  }

  joinAppointment(appointment: Appointment, event: Event): void {
    event.stopPropagation();

    // Check if it's at least X minutes before the scheduled time
    const now = new Date();
    const scheduledTime = new Date(appointment.scheduled_at);
    const earliestJoin = new Date(scheduledTime.getTime() - this.appointmentEarlyJoinMinutes * 60 * 1000);

    if (now < earliestJoin) {
      const scheduledTimeStr = scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.tooEarlyError.set({ appointmentId: appointment.id, time: scheduledTimeStr, minutes: this.appointmentEarlyJoinMinutes });
      setTimeout(() => {
        if (this.tooEarlyError()?.appointmentId === appointment.id) {
          this.tooEarlyError.set(null);
        }
      }, 5000);
      return;
    }

    if (appointment.consultation_id) {
      this.router.navigate(['/app/consultations', appointment.consultation_id], {
        queryParams: { join: true, appointmentId: appointment.id },
      });
    } else {
      this.router.navigate(['/app/appointments'], {
        queryParams: { appointmentId: appointment.id, join: true },
      });
    }
  }

  joinNextAppointment(event: Event): void {
    event.stopPropagation();
    const apt = this.nextAppointment();
    if (apt && apt.id && apt.scheduled_at) {
      // Check if it's at least X minutes before the scheduled time
      const now = new Date();
      const scheduledTime = new Date(apt.scheduled_at);
      const earliestJoin = new Date(scheduledTime.getTime() - this.appointmentEarlyJoinMinutes * 60 * 1000);

      if (now < earliestJoin) {
        const scheduledTimeStr = scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.tooEarlyError.set({ appointmentId: apt.id, time: scheduledTimeStr, minutes: this.appointmentEarlyJoinMinutes });
        setTimeout(() => {
          if (this.tooEarlyError()?.appointmentId === apt.id) {
            this.tooEarlyError.set(null);
          }
        }, 5000);
        return;
      }

      if (apt.consultation_id) {
        this.router.navigate(['/app/consultations', apt.consultation_id], {
          queryParams: { join: true, appointmentId: apt.id },
        });
      } else {
        this.router.navigate(['/app/appointments'], {
          queryParams: { appointmentId: apt.id, join: true },
        });
      }
    }
  }

  viewNextAppointment(): void {
    const apt = this.nextAppointment();
    if (apt) {
      if (apt.consultation_id) {
        this.router.navigate(['/app/consultations', apt.consultation_id], {
          queryParams: { appointmentId: apt.id },
        });
      } else {
        this.router.navigate(['/app/appointments'], {
          queryParams: { appointmentId: apt.id },
        });
      }
    }
  }

  retry(): void {
    this.loadDashboardData();
  }
}

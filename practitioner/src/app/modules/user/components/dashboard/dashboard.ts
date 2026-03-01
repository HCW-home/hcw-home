import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
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
import {
  Consultation,
  Appointment,
  DashboardNextAppointment,
  AppointmentType,
  AppointmentStatus,
} from '../../../../core/models/consultation';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { getAppointmentBadgeType } from '../../../../shared/tools/helper';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';
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
})
export class Dashboard implements OnInit, OnDestroy {
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private router = inject(Router);
  private t = inject(TranslationService);
  private datePipe = inject(DatePipe);
  private destroy$ = new Subject<void>();

  loading = signal(true);
  error = signal<string | null>(null);

  nextAppointment = signal<DashboardNextAppointment | null>(null);
  upcomingAppointments = signal<Appointment[]>([]);
  overdueConsultations = signal<Consultation[]>([]);

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
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboardData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.consultationService
      .getDashboard()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.nextAppointment.set(data.next_appointment);
          this.upcomingAppointments.set(data.upcoming_appointments || []);
          this.overdueConsultations.set(data.overdue_consultations || []);
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
    const date = new Date(dateStr);
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
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours > 0) {
      return this.t.instant('dashboard.inHours', { count: String(diffHours) });
    } else {
      return this.t.instant('dashboard.soon');
    }
  }

  navigateToConsultations(): void {
    this.router.navigate(['/app/consultations']);
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
    if (apt && apt.id) {
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

import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  signal,
  inject,
  viewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import {
  FullCalendarModule,
  FullCalendarComponent,
} from '@fullcalendar/angular';
import {
  CalendarOptions,
  EventInput,
  EventClickArg,
  EventHoveringArg,
  DatesSetArg,
  DateSelectArg,
} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Page } from '../../../../core/components/page/page';
import { Loader } from '../../../../shared/components/loader/loader';
import { Badge } from '../../../../shared/components/badge/badge';
import { BadgeTypeEnum } from '../../../../shared/constants/badge';
import { Svg } from '../../../../shared/ui-components/svg/svg';
import { Button } from '../../../../shared/ui-components/button/button';
import {
  ButtonStyleEnum,
  ButtonSizeEnum,
} from '../../../../shared/constants/button';
import { ConsultationService } from '../../../../core/services/consultation.service';
import { IncomingCallService } from '../../../../core/services/incoming-call.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Participant,
  ParticipantStatus,
} from '../../../../core/models/consultation';
import { RoutePaths } from '../../../../core/constants/routes';
import {
  getAppointmentBadgeType,
  parseDateWithoutTimezone,
} from '../../../../shared/tools/helper';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { LocalDatePipe } from '../../../../shared/pipes/local-date.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';
import { UserService } from '../../../../core/services/user.service';
import { ConfirmPresenceModal } from './confirm-presence-modal/confirm-presence-modal';
import { AppointmentFormModal } from '../consultation-detail/appointment-form-modal/appointment-form-modal';
import { VideoConsultationComponent } from '../video-consultation/video-consultation';

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'list';

@Component({
  selector: 'app-appointments',
  imports: [
    CommonModule,
    Page,
    Loader,
    Svg,
    Badge,
    Button,
    FullCalendarModule,
    LocalDatePipe,
    TranslatePipe,
    ConfirmPresenceModal,
    AppointmentFormModal,
    VideoConsultationComponent,
  ],
  templateUrl: './appointments.html',
  styleUrl: './appointments.scss',
})
export class Appointments implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private userService = inject(UserService);
  private el = inject(ElementRef);
  private incomingCallService = inject(IncomingCallService);
  private t = inject(TranslationService);

  protected readonly getAppointmentBadgeType = getAppointmentBadgeType;
  protected readonly AppointmentType = AppointmentType;
  protected readonly BadgeTypeEnum = BadgeTypeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;

  calendarComponent = viewChild<FullCalendarComponent>('calendar');
  hoveredAppointment = signal<Appointment | null>(null);
  tooltipPosition = signal<{ top: number; left: number }>({ top: 0, left: 0 });
  selectedAppointmentForMenu = signal<Appointment | null>(null);
  menuPosition = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  loading = signal(true);
  loadingMore = signal(false);
  hasMore = signal(false);
  appointments = signal<Appointment[]>([]);
  calendarEvents = signal<EventInput[]>([]);
  currentView = signal<CalendarView>('timeGridWeek');
  currentTitle = signal<string>('');

  confirmPresenceModalOpen = signal(false);
  confirmPresenceParticipantId = signal<number | null>(null);
  createAppointmentModalOpen = signal(false);
  editingAppointment = signal<Appointment | null>(null);
  selectedStartDate = signal<Date | null>(null);
  selectedEndDate = signal<Date | null>(null);

  highlightedAppointmentId = signal<number | null>(null);
  inCall = signal(false);
  activeAppointmentId = signal<number | null>(null);
  isVideoMinimized = signal(false);

  private readonly pageSize = 20;
  private listCurrentPage = 1;
  private currentDateRange: { start: string; end: string } | null = null;

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: false,
    height: 'auto',
    weekends: true,
    editable: false,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    eventClick: this.handleEventClick.bind(this),
    datesSet: this.handleDatesSet.bind(this),
    eventMouseEnter: this.handleEventMouseEnter.bind(this),
    eventMouseLeave: this.handleEventMouseLeave.bind(this),
    select: this.handleDateSelect.bind(this),
    slotMinTime: '00:00:00',
    slotMaxTime: '24:00:00',
    allDaySlot: false,
    nowIndicator: true,
    slotDuration: '00:30:00',
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    dayHeaderFormat: {
      weekday: 'short',
      day: 'numeric',
    },
  };

  @HostListener('window:resize')
  onResize(): void {
    this.updateCalendarHeight();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const menuElement = this.el.nativeElement.querySelector('.appointment-context-menu');
    if (menuElement && !menuElement.contains(target)) {
      this.closeContextMenu();
    }
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const participantId = params['participantId'];
      const appointmentId = params['appointmentId'];

      if (participantId) {
        this.openConfirmPresenceModal(Number(participantId));
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });
      }

      if (appointmentId) {
        const join = params['join'] === 'true';
        const id = Number(appointmentId);
        this.highlightedAppointmentId.set(id);
        if (join) {
          this.activeAppointmentId.set(id);
          this.inCall.set(true);
          this.incomingCallService.setActiveCall(id);
        }
        this.setView('list');
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.updateCalendarHeight();
      this.scrollToNowIndicator();
    });
  }

  private updateCalendarHeight(): void {
    if (this.currentView() === 'list') return;

    const calendarApi = this.calendarComponent()?.getApi();
    if (!calendarApi) return;

    const userContent = this.el.nativeElement.closest(
      '.user-content'
    ) as HTMLElement;
    if (!userContent) return;

    const containerEl = this.el.nativeElement.querySelector(
      '.appointments-container'
    ) as HTMLElement;
    const headerEl = this.el.nativeElement.querySelector(
      '.calendar-header'
    ) as HTMLElement;
    const wrapperEl = this.el.nativeElement.querySelector(
      '.calendar-wrapper'
    ) as HTMLElement;
    if (!containerEl || !headerEl || !wrapperEl) return;

    const contentHeight = userContent.clientHeight;
    const containerStyle = getComputedStyle(containerEl);
    const headerStyle = getComputedStyle(headerEl);
    const wrapperStyle = getComputedStyle(wrapperEl);

    const usedHeight =
      parseFloat(containerStyle.paddingTop) +
      parseFloat(containerStyle.paddingBottom) +
      headerEl.offsetHeight +
      parseFloat(headerStyle.marginBottom) +
      parseFloat(wrapperStyle.paddingTop) +
      parseFloat(wrapperStyle.paddingBottom) +
      parseFloat(wrapperStyle.borderTopWidth) +
      parseFloat(wrapperStyle.borderBottomWidth);

    const availableHeight = contentHeight - usedHeight;
    calendarApi.setOption('height', Math.max(200, availableHeight));
    calendarApi.updateSize();
  }

  private scrollToNowIndicator(): void {
    const indicator = this.el.nativeElement.querySelector(
      '.fc-timegrid-now-indicator-line'
    );
    if (indicator) {
      const scroller = indicator.closest('.fc-scroller');
      if (scroller) {
        const indicatorTop = indicator.offsetTop;
        const scrollerHeight = scroller.clientHeight;
        scroller.scrollTop = indicatorTop - scrollerHeight / 3;
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAppointments(): void {
    if (this.currentView() === 'list') {
      this.loadAllAppointments();
      return;
    }

    if (!this.currentDateRange) {
      return;
    }

    this.loading.set(true);

    this.consultationService
      .getAppointments({
        page_size: 100,
        status: AppointmentStatus.SCHEDULED,
        scheduled_at__date__gte: this.currentDateRange.start,
        scheduled_at__date__lte: this.currentDateRange.end,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.appointments.set(response.results);
          this.calendarEvents.set(
            this.transformToCalendarEvents(response.results)
          );
          this.loading.set(false);
        },
        error: err => {
          this.toasterService.show(
            'error',
            this.t.instant('appointments.errorLoadingAppointments'),
            getErrorMessage(err)
          );
          this.loading.set(false);
        },
      });
  }

  private loadAllAppointments(): void {
    this.loading.set(true);
    this.listCurrentPage = 1;

    const params: Record<string, unknown> = {
      page_size: this.pageSize,
      status: AppointmentStatus.SCHEDULED,
    };

    if (this.currentDateRange && !this.highlightedAppointmentId()) {
      params['scheduled_at__date__gte'] = this.currentDateRange.start;
      params['scheduled_at__date__lte'] = this.currentDateRange.end;
    }

    this.consultationService
      .getAppointments(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.appointments.set(response.results);
          this.hasMore.set(!!response.next);
          this.loading.set(false);
          this.scrollToHighlightedAppointment();
        },
        error: err => {
          this.toasterService.show(
            'error',
            this.t.instant('appointments.errorLoadingAppointments'),
            getErrorMessage(err)
          );
          this.loading.set(false);
        },
      });
  }

  private scrollToHighlightedAppointment(): void {
    const id = this.highlightedAppointmentId();
    if (!id) return;

    setTimeout(() => {
      const element = this.el.nativeElement.querySelector('.appointment-item.highlighted');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;

    this.loadingMore.set(true);
    this.listCurrentPage++;

    const params: Record<string, unknown> = {
      page_size: this.pageSize,
      page: this.listCurrentPage,
      status: AppointmentStatus.SCHEDULED,
    };

    if (this.currentDateRange) {
      params['scheduled_at__date__gte'] = this.currentDateRange.start;
      params['scheduled_at__date__lte'] = this.currentDateRange.end;
    }

    this.consultationService
      .getAppointments(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.appointments.update(current => [
            ...current,
            ...response.results,
          ]);
          this.hasMore.set(!!response.next);
          this.loadingMore.set(false);
        },
        error: err => {
          this.toasterService.show(
            'error',
            this.t.instant('appointments.errorLoadingAppointments'),
            getErrorMessage(err)
          );
          this.loadingMore.set(false);
        },
      });
  }

  private transformToCalendarEvents(appointments: Appointment[]): EventInput[] {
    return appointments.map(appointment => ({
      id: appointment.id.toString(),
      title: this.getEventTitle(appointment),
      start:
        parseDateWithoutTimezone(appointment.scheduled_at) ||
        appointment.scheduled_at,
      end: appointment.end_expected_at
        ? parseDateWithoutTimezone(appointment.end_expected_at) || undefined
        : undefined,
      backgroundColor: this.getStatusColor(appointment.status),
      borderColor: this.getStatusColor(appointment.status),
      textColor: '#ffffff',
      extendedProps: { appointment },
    }));
  }

  private getEventTitle(appointment: Appointment): string {
    const title = appointment.title || this.t.instant('appointments.defaultTitle');
    const type = this.getAppointmentTypeLabel(appointment.type);
    return `${title} (${type})`;
  }

  getAppointmentTypeLabel(type: AppointmentType | string): string {
    const t = typeof type === 'string' ? type.toLowerCase() : type;
    switch (t) {
      case 'online':
      case AppointmentType.ONLINE:
        return this.t.instant('appointments.videoCall');
      case 'inperson':
      case 'in_person':
      case AppointmentType.INPERSON:
        return this.t.instant('appointments.inPerson');
      default:
        return String(type);
    }
  }

  getStatusColor(status: AppointmentStatus | string): string {
    const s = typeof status === 'string' ? status.toLowerCase() : status;
    switch (s) {
      case 'scheduled':
      case AppointmentStatus.SCHEDULED:
        return '#3b82f6';
      case 'cancelled':
      case AppointmentStatus.CANCELLED:
        return '#ef4444';
      case 'completed':
        return '#10b981';
      case 'in_progress':
        return '#f59e0b';
      case 'draft':
      case AppointmentStatus.DRAFT:
        return '#f59e0b';
      default:
        return '#6366f1';
    }
  }

  handleEventClick(clickInfo: EventClickArg): void {
    clickInfo.jsEvent.preventDefault();
    clickInfo.jsEvent.stopPropagation();

    const appointment = clickInfo.event.extendedProps[
      'appointment'
    ] as Appointment;

    const rect = clickInfo.el.getBoundingClientRect();
    this.menuPosition.set({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
    });

    this.selectedAppointmentForMenu.set(appointment);
  }

  handleDatesSet(arg: DatesSetArg): void {
    this.updateTitle();

    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const newStart = formatDate(arg.start);
    const newEnd = formatDate(arg.end);

    if (
      !this.currentDateRange ||
      this.currentDateRange.start !== newStart ||
      this.currentDateRange.end !== newEnd
    ) {
      this.currentDateRange = { start: newStart, end: newEnd };
      this.loadAppointments();
    }
  }

  handleEventMouseEnter(info: EventHoveringArg): void {
    const appointment = info.event.extendedProps['appointment'] as Appointment;
    if (appointment) {
      const rect = info.el.getBoundingClientRect();
      this.tooltipPosition.set({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      });
      this.hoveredAppointment.set(appointment);
    }
  }

  handleEventMouseLeave(): void {
    this.hoveredAppointment.set(null);
  }

  handleDateSelect(selectInfo: DateSelectArg): void {
    this.selectedStartDate.set(selectInfo.start);
    this.selectedEndDate.set(selectInfo.end);
    this.openCreateAppointmentModal();
    const calendarApi = selectInfo.view.calendar;
    calendarApi.unselect();
  }

  private updateTitle(): void {
    const calendarApi = this.calendarComponent()?.getApi();
    if (calendarApi) {
      this.currentTitle.set(calendarApi.view.title);
    }
  }

  setView(view: CalendarView): void {
    const previousView = this.currentView();
    this.currentView.set(view);

    if (view === 'list') {
      // Force the hidden calendar back to week view so the date range and title
      // always reflect a week when in list mode
      const calendarApi = this.calendarComponent()?.getApi();
      if (calendarApi && calendarApi.view.type !== 'timeGridWeek') {
        calendarApi.changeView('timeGridWeek');
        // handleDatesSet will fire and call loadAppointments() -> loadAllAppointments()
      } else {
        this.loadAllAppointments();
      }
    } else {
      const calendarApi = this.calendarComponent()?.getApi();
      if (calendarApi) {
        calendarApi.changeView(view);
      }
      if (previousView === 'list') {
        this.loadAppointments();
      }
    }
  }

  isActiveView(view: CalendarView): boolean {
    return this.currentView() === view;
  }

  goToToday(): void {
    const calendarApi = this.calendarComponent()?.getApi();
    if (calendarApi) {
      calendarApi.today();
    }
  }

  navigatePrev(): void {
    const calendarApi = this.calendarComponent()?.getApi();
    if (calendarApi) {
      calendarApi.prev();
    }
  }

  navigateNext(): void {
    const calendarApi = this.calendarComponent()?.getApi();
    if (calendarApi) {
      calendarApi.next();
    }
  }

  viewAppointment(appointment: Appointment): void {
    const consultationId =
      appointment.consultation_id || appointment.consultation;
    if (consultationId) {
      this.router.navigate([RoutePaths.USER, 'consultations', consultationId], {
        queryParams: { appointmentId: appointment.id },
      });
    }
  }

  getParticipantName(participant: Participant): string {
    if (participant.user) {
      const firstName = participant.user.first_name || '';
      const lastName = participant.user.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      return (
        fullName ||
        participant.user.email ||
        this.t.instant('appointments.participantUnknown')
      );
    }
    return this.t.instant('appointments.participantUnknown');
  }

  getParticipantStatusColor(status: ParticipantStatus | undefined): string {
    switch (status) {
      case 'confirmed':
        return 'var(--emerald-500)';
      case 'invited':
        return 'var(--blue-500)';
      case 'unavailable':
        return 'var(--rose-500)';
      case 'cancelled':
        return 'var(--slate-400)';
      case 'draft':
        return 'var(--amber-500)';
      default:
        return 'var(--slate-500)';
    }
  }

  getParticipantStatusLabel(status: ParticipantStatus | undefined): string {
    switch (status) {
      case 'confirmed':
        return this.t.instant('appointments.participantConfirmed');
      case 'invited':
        return this.t.instant('appointments.participantPending');
      case 'unavailable':
        return this.t.instant('appointments.participantDeclined');
      case 'cancelled':
        return this.t.instant('appointments.participantCancelled');
      case 'draft':
        return this.t.instant('appointments.participantDraft');
      default:
        return this.t.instant('appointments.participantUnknown');
    }
  }

  getAppointmentStatusLabel(status: AppointmentStatus | string): string {
    const s = typeof status === 'string' ? status.toLowerCase() : status;
    switch (s) {
      case 'scheduled':
      case AppointmentStatus.SCHEDULED:
        return this.t.instant('appointments.statusScheduled');
      case 'cancelled':
      case AppointmentStatus.CANCELLED:
        return this.t.instant('appointments.statusCancelled');
      case 'completed':
        return this.t.instant('appointments.statusCompleted');
      case 'in_progress':
        return this.t.instant('appointments.statusInProgress');
      case 'draft':
      case AppointmentStatus.DRAFT:
        return this.t.instant('appointments.statusDraft');
      default:
        return String(status);
    }
  }

  getStatusClass(status: AppointmentStatus | string): string {
    const s = typeof status === 'string' ? status.toLowerCase() : status;
    switch (s) {
      case 'scheduled':
        return 'scheduled';
      case 'cancelled':
        return 'cancelled';
      case 'completed':
        return 'completed';
      case 'in_progress':
        return 'in-progress';
      default:
        return 'scheduled';
    }
  }

  getMyParticipant(appointment: Appointment): Participant | undefined {
    const currentUser = this.userService.currentUserValue;
    if (!currentUser || !appointment.participants) return undefined;
    return appointment.participants.find(p => p.user?.id === currentUser.pk);
  }

  canConfirmPresence(appointment: Appointment): boolean {
    const myParticipant = this.getMyParticipant(appointment);
    return !!myParticipant && myParticipant.status === 'invited';
  }

  openConfirmPresenceModal(participantId: number): void {
    this.confirmPresenceParticipantId.set(participantId);
    this.confirmPresenceModalOpen.set(true);
  }

  openConfirmPresenceForAppointment(
    appointment: Appointment,
    event: MouseEvent
  ): void {
    event.stopPropagation();
    const myParticipant = this.getMyParticipant(appointment);
    if (myParticipant) {
      this.openConfirmPresenceModal(myParticipant.id);
    }
  }

  onConfirmPresenceModalClosed(): void {
    this.confirmPresenceModalOpen.set(false);
    this.confirmPresenceParticipantId.set(null);
  }

  onPresenceConfirmed(): void {
    this.loadAppointments();
  }

  openCreateAppointmentModal(): void {
    this.createAppointmentModalOpen.set(true);
  }

  onCreateAppointmentModalClosed(): void {
    this.createAppointmentModalOpen.set(false);
    this.editingAppointment.set(null);
    this.selectedStartDate.set(null);
    this.selectedEndDate.set(null);
  }

  onAppointmentCreated(): void {
    this.createAppointmentModalOpen.set(false);
    this.editingAppointment.set(null);
    this.selectedStartDate.set(null);
    this.selectedEndDate.set(null);
    this.loadAppointments();
  }

  onAppointmentUpdated(): void {
    this.createAppointmentModalOpen.set(false);
    this.editingAppointment.set(null);
    this.selectedStartDate.set(null);
    this.selectedEndDate.set(null);
    this.loadAppointments();
  }

  joinVideoCall(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.activeAppointmentId.set(appointment.id);
    this.inCall.set(true);
    this.incomingCallService.setActiveCall(appointment.id);
  }

  onCallEnded(): void {
    this.inCall.set(false);
    this.activeAppointmentId.set(null);
    this.isVideoMinimized.set(false);
    this.incomingCallService.clearActiveCall();
  }

  toggleVideoSize(): void {
    this.isVideoMinimized.update(v => !v);
  }

  canJoinVideoCall(appointment: Appointment): boolean {
    return (
      appointment.status === AppointmentStatus.SCHEDULED &&
      appointment.type === AppointmentType.ONLINE
    );
  }

  closeContextMenu(): void {
    this.selectedAppointmentForMenu.set(null);
  }

  editAppointment(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.closeContextMenu();
    this.editingAppointment.set(appointment);
    this.createAppointmentModalOpen.set(true);
  }

  cancelAppointment(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.closeContextMenu();

    if (!confirm(this.t.instant('appointments.confirmCancel'))) {
      return;
    }

    this.consultationService
      .updateAppointment(appointment.id, { status: AppointmentStatus.CANCELLED })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toasterService.show(
            'success',
            this.t.instant('appointments.cancelSuccess')
          );
          this.loadAppointments();
        },
        error: err => {
          this.toasterService.show(
            'error',
            this.t.instant('appointments.cancelError'),
            getErrorMessage(err)
          );
        },
      });
  }

  joinVideoCallFromMenu(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.closeContextMenu();
    this.activeAppointmentId.set(appointment.id);
    this.inCall.set(true);
    this.incomingCallService.setActiveCall(appointment.id);
  }

  viewConsultationFromMenu(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    this.closeContextMenu();

    const consultationId =
      appointment.consultation_id || appointment.consultation;
    if (consultationId) {
      this.router.navigate([RoutePaths.USER, 'consultations', consultationId], {
        queryParams: { appointmentId: appointment.id },
      });
    }
  }

  hasConsultation(appointment: Appointment): boolean {
    return !!(appointment.consultation_id || appointment.consultation);
  }
}

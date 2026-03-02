import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  computed,
  viewChild,
  ViewChildren,
  QueryList,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subject, takeUntil, map } from 'rxjs';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import {
  FullCalendarModule,
  FullCalendarComponent,
} from '@fullcalendar/angular';
import { CalendarOptions, EventInput, EventClickArg, DatesSetArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import { ConsultationService } from '../../../../core/services/consultation.service';
import { ConfirmationService } from '../../../../core/services/confirmation.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { ConsultationWebSocketService } from '../../../../core/services/consultation-websocket.service';
import { UserService } from '../../../../core/services/user.service';
import { IncomingCallService } from '../../../../core/services/incoming-call.service';
import {
  Consultation,
  Appointment,
  Participant,
  AppointmentStatus,
  AppointmentType,
  CustomField,
  Queue,
  CreateConsultationRequest,
} from '../../../../core/models/consultation';
import { IUser } from '../../models/user';

import { Page } from '../../../../core/components/page/page';
import { Loader } from '../../../../shared/components/loader/loader';
import {
  MessageList,
  Message,
  SendMessageData,
  EditMessageData,
  DeleteMessageData,
} from '../../../../shared/components/message-list/message-list';
import { VideoConsultationComponent } from '../video-consultation/video-consultation';

import { Svg } from '../../../../shared/ui-components/svg/svg';
import { Button } from '../../../../shared/ui-components/button/button';
import { Badge } from '../../../../shared/components/badge/badge';
import { Input } from '../../../../shared/ui-components/input/input';
import { Textarea } from '../../../../shared/ui-components/textarea/textarea';
import { Checkbox } from '../../../../shared/ui-components/checkbox/checkbox';
import { Select, AsyncSearchFn, AsyncSearchResult } from '../../../../shared/ui-components/select/select';
import { SelectOption } from '../../../../shared/models/select';
import {
  ButtonStyleEnum,
  ButtonSizeEnum,
  ButtonStateEnum,
} from '../../../../shared/constants/button';
import { BadgeTypeEnum } from '../../../../shared/constants/badge';
import {
  getParticipantBadgeType,
  getAppointmentBadgeType,
  parseDateWithoutTimezone,
} from '../../../../shared/tools/helper';
import { LocalDatePipe } from '../../../../shared/pipes/local-date.pipe';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { AppointmentFormModal } from './appointment-form-modal/appointment-form-modal';
import { RoutePaths } from '../../../../core/constants/routes';
import { ParticipantItem } from '../../../../shared/components/participant-item/participant-item';
import { UserAvatar } from '../../../../shared/components/user-avatar/user-avatar';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';

type AppointmentViewMode = 'list' | 'calendar';
type AppointmentStatusFilter = 'all' | 'scheduled' | 'cancelled';
type AppointmentTimeFilter = 'all' | 'upcoming' | 'past';

@Component({
  selector: 'app-consultation-detail',
  templateUrl: './consultation-detail.html',
  styleUrl: './consultation-detail.scss',
  imports: [
    Svg,
    Page,
    Loader,
    MessageList,
    VideoConsultationComponent,
    CommonModule,
    ReactiveFormsModule,
    Button,
    Badge,
    Input,
    Textarea,
    Checkbox,
    Select,
    AppointmentFormModal,
    FullCalendarModule,
    LocalDatePipe,
    ParticipantItem,
    UserAvatar,
    TranslatePipe,
  ],
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
export class ConsultationDetail implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private location = inject(Location);

  consultationId!: number;
  consultation = signal<Consultation | null>(null);
  appointments = signal<Appointment[]>([]);
  selectedAppointment = signal<Appointment | null>(null);

  isLoadingConsultation = signal(false);
  isLoadingAppointments = signal(false);
  isLoadingMoreAppointments = signal(false);
  hasMoreAppointments = signal(false);
  private appointmentPage = 1;
  private appointmentPageSize = 20;

  messages = signal<Message[]>([]);
  isWebSocketConnected = signal(false);
  currentUser = signal<IUser | null>(null);
  isLoadingMore = signal(false);
  hasMore = signal(true);
  private currentPage = 1;

  inCall = signal(false);
  activeAppointmentId = signal<number | null>(null);
  isVideoMinimized = signal(false);

  isExportingPdf = signal(false);

  showCreateAppointmentModal = signal(false);
  editingAppointment = signal<Appointment | null>(null);

  appointmentViewMode = signal<AppointmentViewMode>('list');
  appointmentStatusFilter = signal<AppointmentStatusFilter>('scheduled');
  appointmentTimeFilter = signal<AppointmentTimeFilter>('upcoming');
  calendarComponent = viewChild<FullCalendarComponent>('appointmentCalendar');
  calendarTitle = signal<string>('');
  highlightedAppointmentId = signal<number | null>(null);
  private pendingScrollToAppointmentId: number | null = null;
  private recentlyModifiedAppointmentIds = new Set<number>();
  private calendarDateRange: { start: string; end: string } | null = null;

  @ViewChildren('appointmentCard') appointmentCards!: QueryList<ElementRef>;

  calendarEvents = computed<EventInput[]>(() => {
    return this.appointments().map(appointment => ({
      id: appointment.id.toString(),
      title: this.getCalendarEventTitle(appointment),
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
  });

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: false,
    height: 'auto',
    weekends: true,
    editable: false,
    selectable: false,
    dayMaxEvents: 3,
    eventClick: this.handleCalendarEventClick.bind(this),
    datesSet: this.handleDatesSet.bind(this),
    eventDidMount: (info) => {
      info.el.setAttribute('title', info.event.title);
    },
    slotMinTime: '06:00:00',
    slotMaxTime: '22:00:00',
    allDaySlot: false,
    nowIndicator: true,
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
  };

  customFields = signal<CustomField[]>([]);

  isEditMode = signal(false);
  isSavingConsultation = signal(false);
  queues = signal<Queue[]>([]);
  editForm!: FormGroup;
  selectedBeneficiary = signal<IUser | null>(null);
  selectedOwner = signal<IUser | null>(null);
  beneficiaryInitialOption = signal<SelectOption | null>(null);
  ownerInitialOption = signal<SelectOption | null>(null);
  private practitionerCache = new Map<number, IUser>();
  private beneficiaryCache = new Map<number, IUser>();

  private fb = inject(FormBuilder);

  queueOptions = computed<SelectOption[]>(() =>
    this.queues().map(queue => ({
      value: queue.id.toString(),
      label: queue.name,
    }))
  );

  beneficiarySearchFn: AsyncSearchFn = (query: string, page: number): Observable<AsyncSearchResult> => {
    return this.userService.searchUsers(query, page, 20, false).pipe(
      map(response => {
        const results: SelectOption[] = response.results.map(user => {
          this.beneficiaryCache.set(user.pk, user);
          return this.userToSelectOption(user);
        });
        return { results, hasMore: response.next !== null };
      })
    );
  };

  practitionerSearchFn: AsyncSearchFn = (query: string, page: number): Observable<AsyncSearchResult> => {
    return this.userService.searchUsers(query, page, 20, false, undefined, true).pipe(
      map(response => {
        const results: SelectOption[] = response.results.map(user => {
          this.practitionerCache.set(user.pk, user);
          return this.userToSelectOption(user);
        });
        return { results, hasMore: response.next !== null };
      })
    );
  };

  private userToSelectOption(user: IUser): SelectOption {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || user.username || 'User';
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    let initials: string;
    if (firstName && lastName) {
      initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    } else {
      initials = (firstName || lastName || user.email || 'U').charAt(0).toUpperCase();
    }
    return {
      value: user.pk,
      label: name,
      secondaryLabel: user.email,
      image: user.picture || undefined,
      initials,
    };
  }

  protected readonly AppointmentStatus = AppointmentStatus;
  protected readonly AppointmentType = AppointmentType;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStateEnum = ButtonStateEnum;
  protected readonly BadgeTypeEnum = BadgeTypeEnum;
  protected readonly getParticipantBadgeType = getParticipantBadgeType;
  protected readonly getAppointmentBadgeType = getAppointmentBadgeType;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private consultationService = inject(ConsultationService);
  private confirmationService = inject(ConfirmationService);
  private toasterService = inject(ToasterService);
  private wsService = inject(ConsultationWebSocketService);
  private userService = inject(UserService);
  private incomingCallService = inject(IncomingCallService);
  private t = inject(TranslationService);

  ngOnInit(): void {
    this.initEditForm();
    this.loadQueues();
    this.loadCustomFields();

    this.userService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser.set(user);
      });

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.consultationId = +params['id'];

      // If an appointmentId is in the URL, switch filters to "all" so the appointment is visible
      const queryParams = this.route.snapshot.queryParams;
      if (queryParams['appointmentId']) {
        this.appointmentStatusFilter.set('all');
        this.appointmentTimeFilter.set('all');
      }

      this.loadConsultation();
      this.loadAppointments();
      this.loadMessages();
      this.connectWebSocket();
      this.checkJoinQueryParam();
    });

    this.setupWebSocketListeners();
  }

  private initEditForm(): void {
    this.editForm = this.fb.group({
      title: [''],
      description: [''],
      beneficiary_id: [''],
      owned_by_id: [''],
      group_id: [''],
      visible_by_patient: [true],
    });

    this.editForm.get('beneficiary_id')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (value) {
          const user = this.beneficiaryCache.get(Number(value));
          this.selectedBeneficiary.set(user || null);
        } else {
          this.selectedBeneficiary.set(null);
        }
      });

    this.editForm.get('owned_by_id')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (value) {
          const user = this.practitionerCache.get(Number(value));
          this.selectedOwner.set(user || null);
        } else {
          this.selectedOwner.set(null);
        }
      });
  }

  private loadQueues(): void {
    this.consultationService
      .getQueues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: queues => {
          this.queues.set(queues);
        },
        error: error => {
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorLoadingQueues'),
            getErrorMessage(error)
          );
        },
      });
  }

  private loadCustomFields(): void {
    this.consultationService
      .getCustomFields('consultations.Consultation')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: fields => {
          this.customFields.set(fields);
        },
      });
  }

  getCustomFieldOptions(field: CustomField): SelectOption[] {
    return (field.options || []).map(o => ({ value: o, label: o }));
  }

  private checkJoinQueryParam(): void {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(queryParams => {
        if (queryParams['appointmentId']) {
          const appointmentId = +queryParams['appointmentId'];
          this.pendingScrollToAppointmentId = appointmentId;
          this.highlightAndScrollToAppointment(appointmentId);

          if (queryParams['join'] === 'true') {
            this.joinVideoCall(appointmentId);
          }
        }
      });
  }

  ngAfterViewInit(): void {
    if (this.appointmentCards) {
      this.appointmentCards.changes
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          if (this.pendingScrollToAppointmentId) {
            this.scrollToAppointment(this.pendingScrollToAppointmentId);
          }
        });
    }
  }

  private highlightAndScrollToAppointment(appointmentId: number): void {
    this.highlightedAppointmentId.set(appointmentId);
    setTimeout(() => {
      this.scrollToAppointment(appointmentId);
    }, 300);
  }

  private scrollToAppointment(appointmentId: number): void {
    if (!this.appointmentCards) return;

    const cardRef = this.appointmentCards.find(
      el => +el.nativeElement.dataset['appointmentId'] === appointmentId
    );

    if (cardRef) {
      cardRef.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      this.pendingScrollToAppointmentId = null;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.wsService.disconnect();
  }

  private connectWebSocket(): void {
    this.wsService.connect(this.consultationId);
  }

  private setupWebSocketListeners(): void {
    this.wsService.state$.pipe(takeUntil(this.destroy$)).subscribe(state => {
      this.isWebSocketConnected.set(state === 'CONNECTED');
    });

    this.wsService.messageUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.state === 'created') {
          const currentUser = this.currentUser();
          const isSystem = !event.data.created_by;

          const newMessage: Message = {
            id: event.data.id,
            username: isSystem
              ? ''
              : `${event.data.created_by.first_name} ${event.data.created_by.last_name}`,
            message: event.data.content,
            timestamp: event.data.created_at,
            isCurrentUser: isSystem
              ? false
              : currentUser?.pk === event.data.created_by.id,
            isSystem,
            attachment: event.data.attachment,
            recording_url: event.data.recording_url,
            isEdited: event.data.is_edited,
            updatedAt: event.data.updated_at,
          };

          // Only add if it doesn't already exist
          const exists = this.messages().some(m => m.id === event.data.id);
          if (!exists) {
            this.messages.update(msgs => [...msgs, newMessage]);
          }
        } else if (event.state === 'updated' || event.state === 'deleted') {
          this.loadMessages();
        }
      });

    this.wsService.participantJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.toasterService.show(
          'success',
          this.t.instant('consultationDetail.participantJoined'),
          this.t.instant('consultationDetail.participantJoinedMessage', {
            name: event.data.username,
          })
        );
        this.loadAppointments();
      });

    this.wsService.participantLeft$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.toasterService.show(
          'warning',
          this.t.instant('consultationDetail.participantLeft'),
          this.t.instant('consultationDetail.participantLeftMessage', {
            name: event.data.username,
          })
        );
        this.loadAppointments();
      });

    this.wsService.appointmentUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadAppointments();
      });

    this.wsService.consultationUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadConsultation(true);
      });

    this.wsService.userOnlineStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        const userId = event.user_id;
        const isOnline = event.data.is_online;
        const current = this.consultation();
        if (!current) return;

        let updated = false;
        const patch = { ...current };

        if (current.created_by?.id === userId) {
          patch.created_by = { ...current.created_by, is_online: isOnline };
          updated = true;
        }
        if (current.owned_by?.id === userId) {
          patch.owned_by = { ...current.owned_by, is_online: isOnline };
          updated = true;
        }
        if (current.beneficiary?.id === userId) {
          patch.beneficiary = { ...current.beneficiary, is_online: isOnline };
          updated = true;
        }

        if (updated) {
          this.consultation.set(patch);
        }

        // Update participant online status in appointments
        const currentAppointments = this.appointments();
        let appointmentsUpdated = false;
        const updatedAppointments = currentAppointments.map(appointment => {
          const hasUser = appointment.participants.some(
            p => p.user?.id === userId
          );
          if (!hasUser) return appointment;
          appointmentsUpdated = true;
          return {
            ...appointment,
            participants: appointment.participants.map(p =>
              p.user?.id === userId
                ? { ...p, user: { ...p.user, is_online: isOnline } }
                : p
            ),
          };
        });
        if (appointmentsUpdated) {
          this.appointments.set(updatedAppointments);
        }
      });
  }

  onSendMessage(data: SendMessageData): void {
    this.consultationService
      .sendConsultationMessage(this.consultationId, {
        content: data.content,
        attachment: data.attachment,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Message will be added via WebSocket
        },
        error: error => {
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorSendingMessage'),
            getErrorMessage(error)
          );
        },
      });
  }

  loadMessages(): void {
    this.currentPage = 1;
    this.consultationService
      .getConsultationMessages(this.consultationId, { page: 1 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const loadedMessages: Message[] = response.results
            .map(msg => {
              const isSystem = !msg.created_by;
              const isCurrentUser = isSystem
                ? false
                : msg.created_by.id === currentUserId;
              const username = isSystem
                ? ''
                : isCurrentUser
                  ? this.t.instant('consultationDetail.you')
                  : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim() ||
                    msg.created_by.email;
              return {
                id: msg.id,
                username,
                message: msg.content || '',
                timestamp: msg.created_at,
                isCurrentUser,
                isSystem,
                attachment: msg.attachment,
                recording_url: msg.recording_url,
                isEdited: msg.is_edited,
                updatedAt: msg.updated_at,
                deletedAt: msg.deleted_at,
              };
            })
            .reverse();
          this.messages.set(loadedMessages);
        },
        error: error => {
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorLoadingMessages'),
            getErrorMessage(error)
          );
        },
      });
  }

  onLoadMore(): void {
    if (this.isLoadingMore() || !this.hasMore()) return;

    this.isLoadingMore.set(true);
    this.currentPage++;

    this.consultationService
      .getConsultationMessages(this.consultationId, { page: this.currentPage })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const olderMessages: Message[] = response.results
            .map(msg => {
              const isSystem = !msg.created_by;
              const isCurrentUser = isSystem
                ? false
                : msg.created_by.id === currentUserId;
              const username = isSystem
                ? ''
                : isCurrentUser
                  ? this.t.instant('consultationDetail.you')
                  : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim() ||
                    msg.created_by.email;
              return {
                id: msg.id,
                username,
                message: msg.content || '',
                timestamp: msg.created_at,
                isCurrentUser,
                isSystem,
                attachment: msg.attachment,
                recording_url: msg.recording_url,
                isEdited: msg.is_edited,
                updatedAt: msg.updated_at,
                deletedAt: msg.deleted_at,
              };
            })
            .reverse();
          this.messages.update(msgs => [...olderMessages, ...msgs]);
          this.isLoadingMore.set(false);
        },
        error: error => {
          this.currentPage--;
          this.isLoadingMore.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorLoadingMessages'),
            getErrorMessage(error)
          );
        },
      });
  }

  loadConsultation(silent = false): void {
    if (!silent) {
      this.isLoadingConsultation.set(true);
    }
    this.consultationService
      .getConsultation(this.consultationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: consultation => {
          this.consultation.set(consultation);
          this.isLoadingConsultation.set(false);
        },
        error: error => {
          this.isLoadingConsultation.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorLoadingConsultation'),
            getErrorMessage(error)
          );
        },
      });
  }

  loadAppointments(): void {
    this.isLoadingAppointments.set(true);
    this.appointmentPage = 1;
    const statusFilter = this.appointmentStatusFilter();
    const timeFilter = this.appointmentTimeFilter();
    const params: {
      status?: string;
      future?: boolean;
      page?: number;
      page_size?: number;
    } = {
      page: 1,
      page_size: this.appointmentPageSize,
    };
    if (statusFilter !== 'all') {
      params.status = statusFilter;
    }
    if (timeFilter === 'upcoming') {
      params.future = true;
    } else if (timeFilter === 'past') {
      params.future = false;
    }
    this.consultationService
      .getConsultationAppointments(this.consultationId, params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.appointments.set(response.results);
          this.hasMoreAppointments.set(response.next !== null);
          this.isLoadingAppointments.set(false);
        },
        error: error => {
          this.isLoadingAppointments.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorLoadingAppointments'),
            getErrorMessage(error)
          );
        },
      });
  }

  loadMoreAppointments(): void {
    if (this.isLoadingMoreAppointments() || !this.hasMoreAppointments()) return;

    this.isLoadingMoreAppointments.set(true);
    this.appointmentPage++;
    const statusFilter = this.appointmentStatusFilter();
    const timeFilter = this.appointmentTimeFilter();
    const params: {
      status?: string;
      future?: boolean;
      page?: number;
      page_size?: number;
    } = {
      page: this.appointmentPage,
      page_size: this.appointmentPageSize,
    };
    if (statusFilter !== 'all') {
      params.status = statusFilter;
    }
    if (timeFilter === 'upcoming') {
      params.future = true;
    } else if (timeFilter === 'past') {
      params.future = false;
    }
    this.consultationService
      .getConsultationAppointments(this.consultationId, params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const currentAppointments = this.appointments();
          this.appointments.set([...currentAppointments, ...response.results]);
          this.hasMoreAppointments.set(response.next !== null);
          this.isLoadingMoreAppointments.set(false);
        },
        error: error => {
          this.appointmentPage--;
          this.isLoadingMoreAppointments.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorLoadingAppointments'),
            getErrorMessage(error)
          );
        },
      });
  }

  loadAppointmentsForCalendar(): void {
    if (!this.calendarDateRange) return;

    this.isLoadingAppointments.set(true);
    const statusFilter = this.appointmentStatusFilter();

    const params: {
      status?: string;
      page_size?: number;
      scheduled_at__date__gte?: string;
      scheduled_at__date__lte?: string;
    } = {
      page_size: 100,
      scheduled_at__date__gte: this.calendarDateRange.start,
      scheduled_at__date__lte: this.calendarDateRange.end,
    };

    if (statusFilter !== 'all') {
      params.status = statusFilter;
    }

    this.consultationService
      .getConsultationAppointments(this.consultationId, params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.appointments.set(response.results);
          this.hasMoreAppointments.set(false);
          this.isLoadingAppointments.set(false);
        },
        error: error => {
          this.isLoadingAppointments.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorLoadingAppointments'),
            getErrorMessage(error)
          );
        },
      });
  }

  sendAppointment(appointment: Appointment): void {
    this.consultationService
      .sendAppointment(appointment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: updatedAppointment => {
          const currentAppointments = this.appointments();
          const updatedAppointments = currentAppointments.map(a =>
            a.id === appointment.id ? updatedAppointment : a
          );
          this.appointments.set(updatedAppointments);
          this.markAppointmentAsLocallyModified(appointment.id);
          this.toasterService.show(
            'success',
            this.t.instant('consultationDetail.appointmentSent'),
            this.t.instant('consultationDetail.appointmentSentMessage')
          );
        },
        error: error => {
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorSendingAppointment'),
            getErrorMessage(error)
          );
        },
      });
  }

  async cancelAppointment(appointment: Appointment): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: this.t.instant('consultationDetail.cancelAppointmentTitle'),
      message: this.t.instant('consultationDetail.cancelAppointmentMessage'),
      confirmText: this.t.instant(
        'consultationDetail.cancelAppointmentConfirm'
      ),
      cancelText: this.t.instant('consultationDetail.goBack'),
      confirmStyle: 'danger',
    });

    if (confirmed) {
      this.consultationService
        .updateAppointment(appointment.id, {
          status: AppointmentStatus.CANCELLED,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updatedAppointment => {
            const currentAppointments = this.appointments();
            this.appointments.set(
              currentAppointments.map(a =>
                a.id === appointment.id ? updatedAppointment : a
              )
            );
            this.markAppointmentAsLocallyModified(appointment.id);
            this.toasterService.show(
              'success',
              this.t.instant('consultationDetail.appointmentCancelled'),
              this.t.instant('consultationDetail.appointmentCancelledMessage')
            );
          },
          error: error => {
            this.toasterService.show(
              'error',
              this.t.instant('consultationDetail.errorCancellingAppointment'),
              getErrorMessage(error)
            );
          },
        });
    }
  }

  async closeConsultation(): Promise<void> {
    if (!this.consultation()) return;

    const confirmed = await this.confirmationService.confirm({
      title: this.t.instant('consultationDetail.closeConsultationTitle'),
      message: this.t.instant('consultationDetail.closeConsultationMessage'),
      confirmText: this.t.instant('consultationDetail.close'),
      cancelText: this.t.instant('consultationDetail.cancel'),
      confirmStyle: 'danger',
    });

    if (confirmed) {
      this.consultationService
        .closeConsultation(this.consultationId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.toasterService.show(
              'success',
              this.t.instant('consultationDetail.consultationClosed'),
              this.t.instant('consultationDetail.consultationClosedMessage')
            );
            this.router.navigate([
              `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
            ]);
          },
          error: error => {
            this.toasterService.show(
              'error',
              this.t.instant('consultationDetail.errorClosingConsultation'),
              getErrorMessage(error)
            );
          },
        });
    }
  }

  async reopenConsultation(): Promise<void> {
    if (!this.consultation()) return;

    const confirmed = await this.confirmationService.confirm({
      title: this.t.instant('consultationDetail.reopenConsultationTitle'),
      message: this.t.instant('consultationDetail.reopenConsultationMessage'),
      confirmText: this.t.instant('consultationDetail.reopen'),
      cancelText: this.t.instant('consultationDetail.cancel'),
      confirmStyle: 'primary',
    });

    if (confirmed) {
      this.consultationService
        .reopenConsultation(this.consultationId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updatedConsultation => {
            this.consultation.set(updatedConsultation);
            this.toasterService.show(
              'success',
              this.t.instant('consultationDetail.consultationReopened'),
              this.t.instant('consultationDetail.consultationReopenedMessage')
            );
          },
          error: error => {
            this.toasterService.show(
              'error',
              this.t.instant('consultationDetail.errorReopeningConsultation'),
              getErrorMessage(error)
            );
          },
        });
    }
  }

  exportPdf(): void {
    if (this.isExportingPdf()) return;

    this.isExportingPdf.set(true);
    this.consultationService
      .exportConsultationPdf(this.consultationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const title = this.consultation()?.title;
          const filename = title
            ? `consultation_${this.consultationId}_${title.toLowerCase().replace(/\s+/g, '_')}.pdf`
            : `consultation_${this.consultationId}.pdf`;
          link.download = filename;
          link.click();
          window.URL.revokeObjectURL(url);
          this.isExportingPdf.set(false);
          this.toasterService.show(
            'success',
            this.t.instant('consultationDetail.pdfExported'),
            this.t.instant('consultationDetail.pdfExportedMessage')
          );
        },
        error: error => {
          this.isExportingPdf.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.exportFailed'),
            getErrorMessage(error)
          );
        },
      });
  }

  editConsultation(): void {
    const currentConsultation = this.consultation();
    if (!currentConsultation) return;

    this.editForm.patchValue({
      title: currentConsultation.title || '',
      description: currentConsultation.description || '',
      beneficiary_id: currentConsultation.beneficiary?.id || '',
      owned_by_id: currentConsultation.owned_by?.id || '',
      group_id: currentConsultation.group?.id?.toString() || '',
      visible_by_patient: currentConsultation.visible_by_patient ?? true,
    });

    // Build custom fields form controls
    if (!this.editForm.get('custom_fields')) {
      const group: Record<string, any> = {};
      this.customFields().forEach(field => {
        group[field.id.toString()] = [''];
      });
      this.editForm.addControl('custom_fields', this.fb.group(group));
    }
    if (currentConsultation.custom_fields?.length) {
      const cfValues: Record<string, string> = {};
      currentConsultation.custom_fields.forEach(cf => {
        cfValues[cf.field.toString()] = cf.value || '';
      });
      this.editForm.get('custom_fields')?.patchValue(cfValues);
    }

    if (currentConsultation.beneficiary) {
      const bUser = {
        pk: currentConsultation.beneficiary.id,
        email: currentConsultation.beneficiary.email,
        first_name: currentConsultation.beneficiary.first_name,
        last_name: currentConsultation.beneficiary.last_name,
      } as IUser;
      this.selectedBeneficiary.set(bUser);
      this.beneficiaryCache.set(bUser.pk, bUser);
      this.beneficiaryInitialOption.set(this.userToSelectOption(bUser));
    } else {
      this.selectedBeneficiary.set(null);
      this.beneficiaryInitialOption.set(null);
    }

    if (currentConsultation.owned_by) {
      const oUser = {
        pk: currentConsultation.owned_by.id,
        email: currentConsultation.owned_by.email,
        first_name: currentConsultation.owned_by.first_name,
        last_name: currentConsultation.owned_by.last_name,
      } as IUser;
      this.selectedOwner.set(oUser);
      this.practitionerCache.set(oUser.pk, oUser);
      this.ownerInitialOption.set(this.userToSelectOption(oUser));
    } else {
      this.selectedOwner.set(null);
      this.ownerInitialOption.set(null);
    }

    this.isEditMode.set(true);
  }

  cancelEdit(): void {
    this.isEditMode.set(false);
    this.selectedBeneficiary.set(null);
    this.selectedOwner.set(null);
    this.beneficiaryInitialOption.set(null);
    this.ownerInitialOption.set(null);
  }

  saveConsultationChanges(): void {
    if (!this.consultationId) return;

    this.isSavingConsultation.set(true);
    const formValue = this.editForm.value;

    const cfGroup = this.editForm.get('custom_fields');
    const customFieldsPayload = cfGroup
      ? Object.entries(cfGroup.value)
          .filter(
            ([_, value]) =>
              value !== '' && value !== null && value !== undefined
          )
          .map(([fieldId, value]) => ({
            field: parseInt(fieldId, 10),
            value: value as string | null,
          }))
      : [];

    const updateData: Partial<CreateConsultationRequest> = {
      title: formValue.title || null,
      description: formValue.description || null,
      beneficiary_id: formValue.beneficiary_id
        ? Number(formValue.beneficiary_id)
        : null,
      owned_by_id: formValue.owned_by_id ? Number(formValue.owned_by_id) : null,
      group_id: formValue.group_id ? Number(formValue.group_id) : null,
      visible_by_patient: formValue.visible_by_patient,
      custom_fields: customFieldsPayload,
    };

    this.consultationService
      .updateConsultation(this.consultationId, updateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: updatedConsultation => {
          this.consultation.set(updatedConsultation);
          this.isSavingConsultation.set(false);
          this.isEditMode.set(false);
          this.toasterService.show(
            'success',
            this.t.instant('consultationDetail.consultationUpdated'),
            this.t.instant('consultationDetail.consultationUpdatedMessage')
          );
        },
        error: error => {
          this.isSavingConsultation.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.updateFailed'),
            getErrorMessage(error),
            {
              trace: JSON.stringify(error.error, null, 2),
            }
          );
        },
      });
  }
  getUserDisplayName(participant: Participant): string {
    if (participant.user) {
      const fullName =
        `${participant.user.first_name || ''} ${participant.user.last_name || ''}`.trim();
      return (
        fullName ||
        participant.user.email ||
        this.t.instant('consultationDetail.unknown')
      );
    }
    return this.t.instant('consultationDetail.unknown');
  }

  getBeneficiaryDisplayName(): string {
    const beneficiary = this.consultation()?.beneficiary;
    if (!beneficiary) return this.t.instant('consultationDetail.noBeneficiary');

    const firstName = beneficiary.first_name?.trim() || '';
    const lastName = beneficiary.last_name?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();

    return (
      fullName ||
      beneficiary.email ||
      this.t.instant('consultationDetail.unknownPatient')
    );
  }

  joinVideoCall(appointmentId: number): void {
    this.activeAppointmentId.set(appointmentId);
    this.inCall.set(true);
    this.incomingCallService.setActiveCall(appointmentId);
  }

  onCallEnded(): void {
    this.inCall.set(false);
    this.activeAppointmentId.set(null);
    this.isVideoMinimized.set(false);
    this.incomingCallService.clearActiveCall();

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  toggleVideoSize(): void {
    this.isVideoMinimized.update(v => !v);
  }

  goBack(): void {
    this.location.back();
  }

  openCreateAppointmentModal(): void {
    this.editingAppointment.set(null);
    this.showCreateAppointmentModal.set(true);
  }

  openEditAppointmentModal(appointment: Appointment): void {
    this.editingAppointment.set(appointment);
    this.showCreateAppointmentModal.set(true);
  }

  closeCreateAppointmentModal(): void {
    this.showCreateAppointmentModal.set(false);
    this.editingAppointment.set(null);
  }

  private markAppointmentAsLocallyModified(appointmentId: number): void {
    this.recentlyModifiedAppointmentIds.add(appointmentId);
    setTimeout(() => {
      this.recentlyModifiedAppointmentIds.delete(appointmentId);
    }, 5000);
  }

  onAppointmentCreated(appointment: Appointment): void {
    const currentAppointments = this.appointments();
    this.appointments.set([...currentAppointments, appointment]);
    this.markAppointmentAsLocallyModified(appointment.id);
  }

  onAppointmentUpdated(updatedAppointment: Appointment): void {
    const currentAppointments = this.appointments();
    const updatedAppointments = currentAppointments.map(a =>
      a.id === updatedAppointment.id ? updatedAppointment : a
    );
    this.appointments.set(updatedAppointments);
    this.markAppointmentAsLocallyModified(updatedAppointment.id);
  }

  getParticipantInitials(participant: Participant): string {
    if (participant.user) {
      const first = participant.user.first_name?.charAt(0) || '';
      const last = participant.user.last_name?.charAt(0) || '';
      if (first || last) {
        return (first + last).toUpperCase();
      }
      if (participant.user.email) {
        return participant.user.email.charAt(0).toUpperCase();
      }
    }
    return '?';
  }

  getLanguageLabel(code: string): string {
    const languages: Record<string, string> = {
      en: this.t.instant('consultationDetail.languageEnglish'),
      de: this.t.instant('consultationDetail.languageGerman'),
      fr: this.t.instant('consultationDetail.languageFrench'),
    };
    return languages[code] || code;
  }

  onEditMessage(data: EditMessageData): void {
    this.consultationService
      .updateConsultationMessage(data.messageId, data.content)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: updatedMessage => {
          this.messages.update(msgs =>
            msgs.map(m =>
              m.id === data.messageId
                ? {
                    ...m,
                    message: updatedMessage.content || '',
                    isEdited: updatedMessage.is_edited,
                    updatedAt: updatedMessage.updated_at,
                  }
                : m
            )
          );
          this.toasterService.show(
            'success',
            this.t.instant('consultationDetail.messageUpdated'),
            this.t.instant('consultationDetail.messageUpdatedMessage')
          );
        },
        error: error => {
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorUpdatingMessage'),
            getErrorMessage(error)
          );
        },
      });
  }

  onDeleteMessage(data: DeleteMessageData): void {
    this.consultationService
      .deleteConsultationMessage(data.messageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: deletedMessage => {
          this.messages.update(msgs =>
            msgs.map(m =>
              m.id === data.messageId
                ? {
                    ...m,
                    message: '',
                    attachment: null,
                    deletedAt: deletedMessage.deleted_at,
                  }
                : m
            )
          );
          this.toasterService.show(
            'success',
            this.t.instant('consultationDetail.messageDeleted'),
            this.t.instant('consultationDetail.messageDeletedMessage')
          );
        },
        error: error => {
          this.toasterService.show(
            'error',
            this.t.instant('consultationDetail.errorDeletingMessage'),
            getErrorMessage(error)
          );
        },
      });
  }

  setAppointmentViewMode(mode: AppointmentViewMode): void {
    const previousMode = this.appointmentViewMode();
    this.appointmentViewMode.set(mode);

    if (mode === 'calendar' && previousMode === 'list') {
      // En mode calendrier, recharger avec les dates du calendrier
      if (this.calendarDateRange) {
        this.loadAppointmentsForCalendar();
      }
    } else if (mode === 'list' && previousMode === 'calendar') {
      // En mode liste, recharger avec les filtres de liste
      this.loadAppointments();
    }
  }

  setAppointmentStatusFilter(filter: AppointmentStatusFilter): void {
    this.appointmentStatusFilter.set(filter);
    if (this.appointmentViewMode() === 'calendar') {
      this.loadAppointmentsForCalendar();
    } else {
      this.loadAppointments();
    }
  }

  setAppointmentTimeFilter(tabId: string): void {
    this.appointmentTimeFilter.set(tabId as AppointmentTimeFilter);
    this.loadAppointments();
  }

  private getCalendarEventTitle(appointment: Appointment): string {
    const typeLabel =
      appointment.type === AppointmentType.ONLINE
        ? this.t.instant('consultationDetail.video')
        : this.t.instant('consultationDetail.inPersonLabel');
    return appointment.title ? `${appointment.title} (${typeLabel})` : typeLabel;
  }

  private getStatusColor(status: AppointmentStatus): string {
    switch (status) {
      case AppointmentStatus.SCHEDULED:
        return '#3b82f6';
      case AppointmentStatus.CANCELLED:
        return '#ef4444';
      case AppointmentStatus.DRAFT:
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  }

  handleCalendarEventClick(clickInfo: EventClickArg): void {
    const appointment = clickInfo.event.extendedProps[
      'appointment'
    ] as Appointment;
    if (appointment) {
      this.openEditAppointmentModal(appointment);
    }
  }

  handleDatesSet(arg: DatesSetArg): void {
    this.calendarTitle.set(arg.view.title);

    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const newStart = formatDate(arg.start);
    const newEnd = formatDate(arg.end);

    if (
      !this.calendarDateRange ||
      this.calendarDateRange.start !== newStart ||
      this.calendarDateRange.end !== newEnd
    ) {
      this.calendarDateRange = { start: newStart, end: newEnd };
      if (this.appointmentViewMode() === 'calendar') {
        this.loadAppointmentsForCalendar();
      }
    }
  }

  calendarPrev(): void {
    setTimeout(() => {
      const calendarApi = this.calendarComponent()?.getApi();
      if (calendarApi) {
        calendarApi.prev();
      }
    });
  }

  calendarNext(): void {
    setTimeout(() => {
      const calendarApi = this.calendarComponent()?.getApi();
      if (calendarApi) {
        calendarApi.next();
      }
    });
  }

  calendarToday(): void {
    setTimeout(() => {
      const calendarApi = this.calendarComponent()?.getApi();
      if (calendarApi) {
        calendarApi.today();
      }
    });
  }

  getCalendarTitle(): string {
    return this.calendarTitle();
  }

  formatConsultationId(id: number): string {
    return `#${String(id).padStart(6, '0')}`;
  }
}

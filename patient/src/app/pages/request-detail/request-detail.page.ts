import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent,
  IonSpinner,
  IonIcon,
  NavController,
  ToastController
} from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';
import { ConsultationService } from '../../core/services/consultation.service';
import { ConsultationWebSocketService } from '../../core/services/consultation-websocket.service';
import { AuthService } from '../../core/services/auth.service';
import { ConsultationRequest, Speciality, User } from '../../core/models/consultation.model';
import { WebSocketState } from '../../core/models/websocket.model';
import { MessageListComponent, Message, SendMessageData, EditMessageData, DeleteMessageData } from '../../shared/components/message-list/message-list';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../core/services/translation.service';
import { LocalDatePipe } from '../../shared/pipes/local-date.pipe';
import { AppHeaderComponent } from '../../shared/app-header/app-header.component';

interface RequestStatus {
  label: string;
  color: 'warning' | 'info' | 'primary' | 'success' | 'muted';
}

@Component({
  selector: 'app-request-detail',
  templateUrl: './request-detail.page.html',
  styleUrls: ['./request-detail.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    LocalDatePipe,
    IonIcon,
    IonContent,
    IonSpinner,
    MessageListComponent,
    TranslatePipe,
    AppHeaderComponent
  ]
})
export class RequestDetailPage implements OnInit, OnDestroy {
  private t = inject(TranslationService);
  private destroy$ = new Subject<void>();
  private requestId: number | null = null;

  request = signal<ConsultationRequest | null>(null);
  isLoading = signal(true);
  messages = signal<Message[]>([]);
  isConnected = signal(false);
  currentUser = signal<User | null>(null);
  isLoadingMore = signal(false);
  hasMore = signal(true);
  private currentPage = 1;
  private totalMessages = 0;

  consultationId = computed(() => {
    const req = this.request();
    if (req?.consultation) {
      return typeof req.consultation === 'object' ? req.consultation.id : req.consultation;
    }
    return null;
  });

  constructor(
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private consultationService: ConsultationService,
    private wsService: ConsultationWebSocketService,
    private authService: AuthService,
    private toastController: ToastController
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    this.setupWebSocketSubscriptions();

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.requestId = +params['id'];
      this.loadRequest();
    });
  }

  ngOnDestroy(): void {
    this.wsService.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCurrentUser(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        if (user) {
          this.currentUser.set(user as User);
        } else {
          this.authService.getCurrentUser().subscribe();
        }
      });
  }

  private setupWebSocketSubscriptions(): void {
    this.wsService.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.isConnected.set(state === WebSocketState.CONNECTED);
      });

    this.wsService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        const newMessage: Message = {
          id: event.data.id,
          username: event.data.username,
          message: event.data.message,
          timestamp: event.data.timestamp,
          isCurrentUser: false,
        };
        this.messages.update(msgs => [...msgs, newMessage]);
      });

    this.wsService.messageUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        const consultationId = this.consultationId();
        if (!consultationId || event.consultation_id !== consultationId) {
          return;
        }

        if (event.state === 'created') {
          const exists = this.messages().some(m => m.id === event.data.id);
          if (!exists) {
            const user = this.currentUser();
            const isSystem = !event.data.created_by;
            const newMessage: Message = {
              id: event.data.id,
              username: isSystem ? '' : `${event.data.created_by.first_name} ${event.data.created_by.last_name}`,
              message: event.data.content,
              timestamp: event.data.created_at,
              isCurrentUser: isSystem ? false : user?.id === event.data.created_by.id,
              isSystem,
              attachment: event.data.attachment,
              isEdited: event.data.is_edited,
              updatedAt: event.data.updated_at,
            };
            this.messages.update(msgs => [...msgs, newMessage]);
          }
        } else if (event.state === 'updated' || event.state === 'deleted') {
          this.loadMessages(consultationId);
        }
      });
  }

  private loadRequest(): void {
    if (!this.requestId) return;

    this.isLoading.set(true);
    this.consultationService.getRequestById(this.requestId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (request) => {
          this.request.set(request);
          this.isLoading.set(false);

          if (request.consultation) {
            const consultationId = typeof request.consultation === 'object'
              ? request.consultation.id
              : request.consultation;
            this.loadMessages(consultationId);
            this.wsService.connect(consultationId);
          }
        },
        error: async (error) => {
          this.isLoading.set(false);
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('requestDetail.failedLoad'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      });
  }

  private loadMessages(consultationId: number): void {
    this.currentPage = 1;
    this.consultationService.getConsultationMessagesPaginated(consultationId, 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.totalMessages = response.count;
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const loadedMessages: Message[] = response.results.map(msg => {
            const isSystem = !msg.created_by;
            const isCurrentUser = isSystem ? false : msg.created_by.id === currentUserId;
            return {
              id: msg.id,
              username: isSystem ? '' : isCurrentUser ? this.t.instant('requestDetail.you') : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim(),
              message: msg.content || '',
              timestamp: msg.created_at,
              isCurrentUser,
              isSystem,
              attachment: msg.attachment,
              isEdited: msg.is_edited,
              updatedAt: msg.updated_at,
              deletedAt: msg.deleted_at,
            };
          }).reverse();
          this.messages.set(loadedMessages);
        },
        error: async (error) => {
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('requestDetail.failedLoadMessages'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      });
  }

  onLoadMore(): void {
    const consultationId = this.consultationId();
    if (!consultationId || this.isLoadingMore() || !this.hasMore()) return;

    this.isLoadingMore.set(true);
    this.currentPage++;

    this.consultationService.getConsultationMessagesPaginated(consultationId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const olderMessages: Message[] = response.results.map(msg => {
            const isSystem = !msg.created_by;
            const isCurrentUser = isSystem ? false : msg.created_by.id === currentUserId;
            return {
              id: msg.id,
              username: isSystem ? '' : isCurrentUser ? this.t.instant('requestDetail.you') : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim(),
              message: msg.content || '',
              timestamp: msg.created_at,
              isCurrentUser,
              isSystem,
              attachment: msg.attachment,
              isEdited: msg.is_edited,
              updatedAt: msg.updated_at,
              deletedAt: msg.deleted_at,
            };
          }).reverse();
          this.messages.update(msgs => [...olderMessages, ...msgs]);
          this.isLoadingMore.set(false);
        },
        error: async (error) => {
          this.currentPage--;
          this.isLoadingMore.set(false);
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('requestDetail.failedLoadMore'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      });
  }

  onSendMessage(data: SendMessageData): void {
    const consultationId = this.consultationId();
    if (!consultationId) return;

    const user = this.currentUser();
    const tempId = Date.now();
    const newMessage: Message = {
      id: tempId,
      username: this.t.instant('requestDetail.you'),
      message: data.content || '',
      timestamp: new Date().toISOString(),
      isCurrentUser: true,
      attachment: data.attachment ? { file_name: data.attachment.name, mime_type: data.attachment.type } : null,
    };
    this.messages.update(msgs => [...msgs, newMessage]);

    this.consultationService.sendConsultationMessage(consultationId, data.content || '', data.attachment)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (savedMessage) => {
          this.messages.update(msgs =>
            msgs.map(m => m.id === tempId ? {
              ...m,
              id: savedMessage.id,
              attachment: savedMessage.attachment
            } : m)
          );
        },
        error: async (error) => {
          this.messages.update(msgs => msgs.filter(m => m.id !== tempId));
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('requestDetail.failedSend'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      });
  }

  onEditMessage(data: EditMessageData): void {
    const consultationId = this.consultationId();
    if (!consultationId) return;

    this.consultationService.updateConsultationMessage(data.messageId, data.content)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (updatedMessage) => {
          this.messages.update(msgs =>
            msgs.map(m => m.id === data.messageId ? {
              ...m,
              message: updatedMessage.content || '',
              isEdited: updatedMessage.is_edited,
              updatedAt: updatedMessage.updated_at,
            } : m)
          );
          const toast = await this.toastController.create({
            message: this.t.instant('requestDetail.messageUpdated'),
            duration: 2000,
            position: 'bottom',
            color: 'success'
          });
          await toast.present();
        },
        error: async (error) => {
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('requestDetail.failedUpdate'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      });
  }

  onDeleteMessage(data: DeleteMessageData): void {
    this.consultationService.deleteConsultationMessage(data.messageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (deletedMessage) => {
          this.messages.update(msgs =>
            msgs.map(m => m.id === data.messageId ? {
              ...m,
              message: '',
              attachment: null,
              deletedAt: deletedMessage.deleted_at,
            } : m)
          );
          const toast = await this.toastController.create({
            message: this.t.instant('requestDetail.messageDeleted'),
            duration: 2000,
            position: 'bottom',
            color: 'success'
          });
          await toast.present();
        },
        error: async (error) => {
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('requestDetail.failedDelete'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      });
  }

  goBack(): void {
    this.navCtrl.back();
  }

  getStatusConfig(status: string | undefined): RequestStatus {
    const normalizedStatus = (status || 'Requested').toLowerCase();
    const statusMap: Record<string, RequestStatus> = {
      'requested': { label: this.t.instant('requestDetail.statusPending'), color: 'warning' },
      'accepted': { label: this.t.instant('requestDetail.statusAccepted'), color: 'info' },
      'scheduled': { label: this.t.instant('requestDetail.statusScheduled'), color: 'primary' },
      'cancelled': { label: this.t.instant('requestDetail.statusCancelled'), color: 'muted' },
      'refused': { label: this.t.instant('requestDetail.statusRefused'), color: 'muted' }
    };
    return statusMap[normalizedStatus] || statusMap['requested'];
  }

  hasAppointment(): boolean {
    return !!this.request()?.appointment;
  }

  hasConsultation(): boolean {
    return !!this.request()?.consultation;
  }

  getReasonName(): string {
    const req = this.request();
    if (req && typeof req.reason === 'object' && req.reason) {
      return req.reason.name;
    }
    return this.t.instant('requestDetail.consultation');
  }

  getSpecialityName(): string {
    const req = this.request();
    if (req && typeof req.reason === 'object' && req.reason) {
      const speciality = req.reason.speciality;
      if (typeof speciality === 'object' && speciality) {
        return (speciality as Speciality).name;
      }
    }
    return '';
  }

  getDoctorName(): string {
    const req = this.request();
    if (!req) return '';

    if (req.appointment?.participants) {
      const doctor = req.appointment.participants.find(p => p.user && p.user.id !== req.created_by?.id);
      if (doctor?.user) {
        return `Dr. ${doctor.user.first_name} ${doctor.user.last_name}`;
      }
    }
    if (typeof req.expected_with === 'object' && req.expected_with) {
      const user = req.expected_with as { first_name?: string; last_name?: string };
      return `Dr. ${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return '';
  }

  getAppointmentTypeIcon(): string {
    return this.request()?.appointment?.type === 'online' ? 'videocam-outline' : 'location-outline';
  }

  getAppointmentTypeLabel(): string {
    return this.request()?.appointment?.type === 'online' ? this.t.instant('requestDetail.videoConsultation') : this.t.instant('requestDetail.inPersonVisit');
  }

  getTypeLabel(): string {
    return this.request()?.type === 'online' ? this.t.instant('requestDetail.videoConsultation') : this.t.instant('requestDetail.inPersonVisit');
  }

  isStatusRequested(): boolean {
    return this.request()?.status?.toLowerCase() === 'requested';
  }

  isStatusAccepted(): boolean {
    return this.request()?.status?.toLowerCase() === 'accepted';
  }

  isStatusRefused(): boolean {
    return this.request()?.status?.toLowerCase() === 'refused';
  }

  viewConsultation(): void {
    const req = this.request();
    if (req?.consultation) {
      const consultationId = typeof req.consultation === 'object' ? req.consultation.id : req.consultation;
      this.navCtrl.navigateForward(`/consultation/${consultationId}`);
    }
  }

  joinAppointment(): void {
    const req = this.request();
    if (req?.appointment) {
      const consultationId = this.consultationId();
      let url = `/consultation/${req.appointment.id}/video?type=appointment`;
      if (consultationId) {
        url += `&consultationId=${consultationId}`;
      }
      this.navCtrl.navigateForward(url);
    }
  }

  async cancelRequest(): Promise<void> {
    const req = this.request();
    if (!req?.id) return;

    this.consultationService.cancelConsultationRequest(req.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async () => {
          const toast = await this.toastController.create({
            message: this.t.instant('requestDetail.cancelSuccess'),
            duration: 3000,
            position: 'bottom',
            color: 'success'
          });
          await toast.present();
          this.navCtrl.back();
        },
        error: async (error) => {
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('requestDetail.failedCancel'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      });
  }
}

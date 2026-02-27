import { Component, OnInit, OnDestroy, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute } from "@angular/router";
import {
  IonIcon,
  IonContent,
  IonSpinner,
  NavController,
  ToastController,
  AlertController,
} from "@ionic/angular/standalone";
import { Subject, takeUntil } from "rxjs";
import { ConsultationService } from "../../core/services/consultation.service";
import { ConsultationWebSocketService } from "../../core/services/consultation-websocket.service";
import { AuthService } from "../../core/services/auth.service";
import {
  Consultation,
  Appointment,
  User,
} from "../../core/models/consultation.model";
import { WebSocketState } from "../../core/models/websocket.model";
import {
  MessageListComponent,
  Message,
  SendMessageData,
  EditMessageData,
  DeleteMessageData,
} from "../../shared/components/message-list/message-list";
import { AppHeaderComponent } from "../../shared/app-header/app-header.component";
import { AppFooterComponent } from "../../shared/app-footer/app-footer.component";
import { TranslatePipe } from "@ngx-translate/core";
import { TranslationService } from "../../core/services/translation.service";
import { LocalDatePipe } from "../../shared/pipes/local-date.pipe";

interface ConsultationStatus {
  label: string;
  color: "warning" | "info" | "primary" | "success" | "muted";
}

@Component({
  selector: "app-consultation-detail",
  templateUrl: "./consultation-detail.page.html",
  styleUrls: ["./consultation-detail.page.scss"],
  standalone: true,
  imports: [
    CommonModule,
    LocalDatePipe,
    IonIcon,
    IonContent,
    IonSpinner,
    MessageListComponent,
    AppHeaderComponent,
    AppFooterComponent,
    TranslatePipe,
  ],
})
export class ConsultationDetailPage implements OnInit, OnDestroy {
  private t = inject(TranslationService);
  private destroy$ = new Subject<void>();
  private consultationId: number | null = null;

  consultation = signal<Consultation | null>(null);
  isLoading = signal(true);
  messages = signal<Message[]>([]);
  isConnected = signal(false);
  currentUser = signal<User | null>(null);
  isLoadingMore = signal(false);
  hasMore = signal(true);
  private currentPage = 1;

  constructor(
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private consultationService: ConsultationService,
    private wsService: ConsultationWebSocketService,
    private authService: AuthService,
    private toastController: ToastController,
    private alertController: AlertController,
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    this.setupWebSocketSubscriptions();

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.consultationId = +params["id"];
      this.loadConsultation();
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
      .subscribe((user) => {
        if (user) {
          this.currentUser.set(user as User);
        } else {
          this.authService.getCurrentUser().subscribe();
        }
      });
  }

  private setupWebSocketSubscriptions(): void {
    this.wsService.state$.pipe(takeUntil(this.destroy$)).subscribe((state) => {
      this.isConnected.set(state === WebSocketState.CONNECTED);
    });

    this.wsService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        const newMessage: Message = {
          id: event.data.id,
          username: event.data.username,
          message: event.data.message,
          timestamp: event.data.timestamp,
          isCurrentUser: false,
        };
        this.messages.update((msgs) => [...msgs, newMessage]);
      });

    this.wsService.messageUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (
          !this.consultationId ||
          event.consultation_id !== this.consultationId
        ) {
          return;
        }

        if (event.state === "created") {
          const exists = this.messages().some((m) => m.id === event.data.id);
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
            this.messages.update((msgs) => [...msgs, newMessage]);
          }
        } else if (event.state === "updated" || event.state === "deleted") {
          this.loadMessages();
        }
      });
  }

  private loadConsultation(): void {
    if (!this.consultationId) return;

    this.isLoading.set(true);
    this.consultationService
      .getConsultationById(this.consultationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (consultation) => {
          this.consultation.set(consultation);
          this.isLoading.set(false);
          this.loadMessages();
          this.wsService.connect(this.consultationId!);
        },
        error: async (error) => {
          this.isLoading.set(false);
          const toast = await this.toastController.create({
            message:
              error?.error?.detail || this.t.instant('consultationDetail.failedLoad'),
            duration: 3000,
            position: "bottom",
            color: "danger",
          });
          await toast.present();
        },
      });
  }

  private loadMessages(): void {
    if (!this.consultationId) return;

    this.currentPage = 1;
    this.consultationService
      .getConsultationMessagesPaginated(this.consultationId, 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const loadedMessages: Message[] = response.results
            .map((msg) => {
              const isSystem = !msg.created_by;
              const isCurrentUser = isSystem ? false : msg.created_by.id === currentUserId;
              return {
                id: msg.id,
                username: isSystem
                  ? ''
                  : isCurrentUser
                    ? this.t.instant('consultationDetail.you')
                    : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim(),
                message: msg.content || "",
                timestamp: msg.created_at,
                isCurrentUser,
                isSystem,
                attachment: msg.attachment,
                isEdited: msg.is_edited,
                updatedAt: msg.updated_at,
                deletedAt: msg.deleted_at,
              };
            })
            .reverse();
          this.messages.set(loadedMessages);
        },
        error: async (error) => {
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('consultationDetail.failedLoadMessages'),
            duration: 3000,
            position: "bottom",
            color: "danger",
          });
          await toast.present();
        },
      });
  }

  onLoadMore(): void {
    if (!this.consultationId || this.isLoadingMore() || !this.hasMore()) return;

    this.isLoadingMore.set(true);
    this.currentPage++;

    this.consultationService
      .getConsultationMessagesPaginated(this.consultationId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const olderMessages: Message[] = response.results
            .map((msg) => {
              const isSystem = !msg.created_by;
              const isCurrentUser = isSystem ? false : msg.created_by.id === currentUserId;
              return {
                id: msg.id,
                username: isSystem
                  ? ''
                  : isCurrentUser
                    ? this.t.instant('consultationDetail.you')
                    : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim(),
                message: msg.content || "",
                timestamp: msg.created_at,
                isCurrentUser,
                isSystem,
                attachment: msg.attachment,
                isEdited: msg.is_edited,
                updatedAt: msg.updated_at,
                deletedAt: msg.deleted_at,
              };
            })
            .reverse();
          this.messages.update((msgs) => [...olderMessages, ...msgs]);
          this.isLoadingMore.set(false);
        },
        error: async (error) => {
          this.currentPage--;
          this.isLoadingMore.set(false);
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('consultationDetail.failedLoadMore'),
            duration: 3000,
            position: "bottom",
            color: "danger",
          });
          await toast.present();
        },
      });
  }

  onSendMessage(data: SendMessageData): void {
    if (!this.consultationId) return;

    const tempId = Date.now();
    const newMessage: Message = {
      id: tempId,
      username: this.t.instant('consultationDetail.you'),
      message: data.content || "",
      timestamp: new Date().toISOString(),
      isCurrentUser: true,
      attachment: data.attachment
        ? { file_name: data.attachment.name, mime_type: data.attachment.type }
        : null,
    };
    this.messages.update((msgs) => [...msgs, newMessage]);

    this.consultationService
      .sendConsultationMessage(
        this.consultationId,
        data.content || "",
        data.attachment,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (savedMessage) => {
          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    id: savedMessage.id,
                    attachment: savedMessage.attachment,
                  }
                : m,
            ),
          );
        },
        error: async (error) => {
          this.messages.update((msgs) => msgs.filter((m) => m.id !== tempId));
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('consultationDetail.failedSend'),
            duration: 3000,
            position: "bottom",
            color: "danger",
          });
          await toast.present();
        },
      });
  }

  onEditMessage(data: EditMessageData): void {
    if (!this.consultationId) return;

    this.consultationService
      .updateConsultationMessage(data.messageId, data.content)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (updatedMessage) => {
          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.id === data.messageId
                ? {
                    ...m,
                    message: updatedMessage.content || "",
                    isEdited: updatedMessage.is_edited,
                    updatedAt: updatedMessage.updated_at,
                  }
                : m,
            ),
          );
          const toast = await this.toastController.create({
            message: this.t.instant('consultationDetail.messageUpdated'),
            duration: 2000,
            position: "bottom",
            color: "success",
          });
          await toast.present();
        },
        error: async (error) => {
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('consultationDetail.failedUpdate'),
            duration: 3000,
            position: "bottom",
            color: "danger",
          });
          await toast.present();
        },
      });
  }

  onDeleteMessage(data: DeleteMessageData): void {
    this.consultationService
      .deleteConsultationMessage(data.messageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (deletedMessage) => {
          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.id === data.messageId
                ? {
                    ...m,
                    message: "",
                    attachment: null,
                    deletedAt: deletedMessage.deleted_at,
                  }
                : m,
            ),
          );
          const toast = await this.toastController.create({
            message: this.t.instant('consultationDetail.messageDeleted'),
            duration: 2000,
            position: "bottom",
            color: "success",
          });
          await toast.present();
        },
        error: async (error) => {
          const toast = await this.toastController.create({
            message: error?.error?.detail || this.t.instant('consultationDetail.failedDelete'),
            duration: 3000,
            position: "bottom",
            color: "danger",
          });
          await toast.present();
        },
      });
  }

  goBack(): void {
    this.navCtrl.back();
  }

  getStatusConfig(status: string | undefined): ConsultationStatus {
    const normalizedStatus = (status || "REQUESTED").toLowerCase();
    const statusMap: Record<string, ConsultationStatus> = {
      requested: { label: this.t.instant('consultationDetail.statusRequested'), color: "warning" },
      active: { label: this.t.instant('consultationDetail.statusActive'), color: "success" },
      closed: { label: this.t.instant('consultationDetail.statusClosed'), color: "muted" },
      cancelled: { label: this.t.instant('consultationDetail.statusCancelled'), color: "muted" },
    };
    return statusMap[normalizedStatus] || statusMap["requested"];
  }


  getDoctorName(): string {
    const cons = this.consultation();
    if (cons?.owned_by) {
      return `${cons.owned_by.first_name} ${cons.owned_by.last_name}`;
    }
    return "";
  }

  getDoctorInitial(): string {
    const cons = this.consultation();
    if (cons?.owned_by?.first_name) {
      return cons.owned_by.first_name.charAt(0).toUpperCase();
    }
    return "?";
  }

  getDoctorSpecialities(): string {
    const cons = this.consultation();
    if (cons?.owned_by?.specialities?.length) {
      return cons.owned_by.specialities.map(s => s.name).join(', ');
    }
    return '';
  }

  getAppointmentTypeIcon(appointment: Appointment): string {
    return appointment.type === "online"
      ? "videocam-outline"
      : "location-outline";
  }

  getAppointmentTypeLabel(appointment: Appointment): string {
    return appointment.type === "online"
      ? this.t.instant('consultationDetail.videoConsultation')
      : this.t.instant('consultationDetail.inPersonVisit');
  }

  isConsultationActive(): boolean {
    return this.consultation()?.status?.toLowerCase() === "active";
  }

  isConsultationClosed(): boolean {
    return this.consultation()?.status?.toLowerCase() === "closed";
  }

  async joinAppointment(appointment: Appointment): Promise<void> {
    const now = new Date();
    const scheduledAt = new Date(appointment.scheduled_at);
    const earliestJoin = new Date(scheduledAt.getTime() - 5 * 60 * 1000);

    if (now < earliestJoin) {
      const time = scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const alert = await this.alertController.create({
        header: this.t.instant('home.tooEarlyTitle'),
        message: this.t.instant('home.tooEarlyMessage', { time }),
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    this.navCtrl.navigateForward(
      `/consultation/${appointment.id}/video?type=appointment&consultationId=${this.consultationId}`,
    );
  }
}

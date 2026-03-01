import { Injectable, OnDestroy } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  distinctUntilChanged,
  firstValueFrom,
} from 'rxjs';
import { WebSocketService } from './websocket.service';
import { ToasterService } from './toaster.service';
import { TranslationService } from './translation.service';
import { Auth } from './auth';
import { environment } from '../../../environments/environment';
import {
  WebSocketState,
  UserMessageEvent,
  NotificationEvent,
  StatusChangedEvent,
  AppointmentJoinedEvent,
} from '../models/websocket';

const WS_CONNECTION_TOAST_ID = 'ws-connection-status';

@Injectable({
  providedIn: 'root',
})
export class UserWebSocketService implements OnDestroy {
  private isOnlineSubject = new BehaviorSubject<boolean>(false);
  private connectionCountSubject = new BehaviorSubject<number>(0);
  private messagesSubject = new Subject<UserMessageEvent>();
  private notificationsSubject = new Subject<NotificationEvent>();
  private appointmentJoinedSubject = new Subject<AppointmentJoinedEvent>();
  private stateSubscription: Subscription | null = null;
  private hadConnectionIssue = false;
  private wasConnected = false;
  private errorToastTimer: ReturnType<typeof setTimeout> | null = null;

  public isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable();
  public connectionCount$: Observable<number> =
    this.connectionCountSubject.asObservable();
  public messages$: Observable<UserMessageEvent> =
    this.messagesSubject.asObservable();
  public notifications$: Observable<NotificationEvent> =
    this.notificationsSubject.asObservable();
  public appointmentJoined$: Observable<AppointmentJoinedEvent> =
    this.appointmentJoinedSubject.asObservable();

  constructor(
    private wsService: WebSocketService,
    private authService: Auth,
    private toasterService: ToasterService,
    private t: TranslationService
  ) {
    this.setupEventListeners();
    this.setupConnectionStatusToasts();
  }

  connect(): void {
    const state = this.wsService.getState();
    if (
      state === WebSocketState.CONNECTED ||
      state === WebSocketState.CONNECTING
    ) {
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      return;
    }

    const wsUrl = `${environment.wsUrl}/user/?token=${token}`;
    this.wsService.connect({
      url: wsUrl,
      urlProvider: async () => {
        try {
          const response = await firstValueFrom(this.authService.refreshAccessToken());
          this.authService.setToken(response.access);
          if (response.refresh) {
            this.authService.setRefreshToken(response.refresh);
          }
          return `${environment.wsUrl}/user/?token=${response.access}`;
        } catch {
          return null;
        }
      },
      reconnect: true,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
      pingInterval: 30000,
    });
  }

  disconnect(): void {
    this.wasConnected = false;
    this.hadConnectionIssue = false;
    this.clearErrorToastTimer();
    this.wsService.disconnect();
    this.isOnlineSubject.next(false);
    this.connectionCountSubject.next(0);
  }

  getConnectionState(): Observable<WebSocketState> {
    return this.wsService.state$;
  }

  isConnected(): boolean {
    return this.wsService.isConnected();
  }

  joinConsultationGroup(consultationId: number): void {
    this.wsService.joinGroup(`consultation_${consultationId}`);
  }

  leaveConsultationGroup(consultationId: number): void {
    this.wsService.leaveGroup(`consultation_${consultationId}`);
  }

  sendMessage(targetUserId: number, message: string): void {
    this.wsService.send({
      type: 'send_message',
      data: {
        target_user_id: targetUserId,
        message,
      },
      timestamp: Date.now(),
    });
  }

  private setupEventListeners(): void {
    this.wsService
      .on('status_changed')
      .subscribe((event: StatusChangedEvent) => {
        this.isOnlineSubject.next(event.data.is_online);
        this.connectionCountSubject.next(event.data.connection_count);
      });

    this.wsService.on('user_message').subscribe((event: UserMessageEvent) => {
      this.messagesSubject.next(event);
    });

    this.wsService.on('notification').subscribe((event: NotificationEvent) => {
      console.log('[UserWS] Notification event received:', event);
      this.notificationsSubject.next(event);
    });

    this.wsService
      .on('appointment')
      .subscribe((event: AppointmentJoinedEvent) => {
        console.log('[UserWS] Appointment event received:', event);
        if (event.state === 'participant_joined') {
          console.log('[UserWS] participant_joined - showing incoming call');
          this.appointmentJoinedSubject.next(event);
        }
      });

    this.wsService.on('error').subscribe(event => {
      console.error('WebSocket error:', event.message);
    });
  }

  private setupConnectionStatusToasts(): void {
    this.stateSubscription = this.wsService.state$
      .pipe(distinctUntilChanged())
      .subscribe(state => {
        switch (state) {
          case WebSocketState.RECONNECTING:
            // Cancel any pending error toast — "reconnecting" takes priority
            this.clearErrorToastTimer();
            this.hadConnectionIssue = true;
            this.toasterService.show(
              'warning',
              this.t.instant('websocket.reconnecting'),
              this.t.instant('websocket.reconnectingMessage'),
              { id: WS_CONNECTION_TOAST_ID, delay: -1, closable: false }
            );
            break;

          case WebSocketState.FAILED:
            // FAILED can be transient (onerror fires right before onclose → RECONNECTING).
            // Defer the toast so RECONNECTING can cancel it.
            this.scheduleErrorToast(
              this.t.instant('websocket.failed'),
              this.t.instant('websocket.failedMessage')
            );
            break;

          case WebSocketState.DISCONNECTED:
            if (this.wasConnected) {
              this.scheduleErrorToast(
                this.t.instant('websocket.disconnected'),
                this.t.instant('websocket.disconnectedMessage')
              );
            }
            break;

          case WebSocketState.CONNECTING:
            // A reconnect attempt is starting — cancel any pending error toast
            this.clearErrorToastTimer();
            break;

          case WebSocketState.CONNECTED:
            this.clearErrorToastTimer();
            if (this.hadConnectionIssue) {
              this.toasterService.show(
                'success',
                this.t.instant('websocket.reconnected'),
                this.t.instant('websocket.reconnectedMessage'),
                { id: WS_CONNECTION_TOAST_ID, delay: 5000, closable: true }
              );
              this.hadConnectionIssue = false;
            }
            this.wasConnected = true;
            break;
        }
      });
  }

  private scheduleErrorToast(title: string, body: string): void {
    this.clearErrorToastTimer();
    this.hadConnectionIssue = true;
    this.errorToastTimer = setTimeout(() => {
      this.errorToastTimer = null;
      this.toasterService.show('error', title, body, {
        id: WS_CONNECTION_TOAST_ID,
        delay: -1,
        closable: true,
      });
    }, 200);
  }

  private clearErrorToastTimer(): void {
    if (this.errorToastTimer) {
      clearTimeout(this.errorToastTimer);
      this.errorToastTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
    this.disconnect();
  }
}

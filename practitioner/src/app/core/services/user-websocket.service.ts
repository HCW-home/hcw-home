import { Injectable, OnDestroy } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  distinctUntilChanged,
  firstValueFrom,
  debounceTime,
  filter,
} from 'rxjs';
import { WebSocketService } from './websocket.service';
import { ToasterService } from './toaster.service';
import { TranslationService } from './translation.service';
import { Auth } from './auth';
import { OfflineService } from './offline.service';
import { environment } from '../../../environments/environment';
import {
  WebSocketState,
  UserMessageEvent,
  NotificationEvent,
  StatusChangedEvent,
  AppointmentJoinedEvent,
  ConsultationEvent,
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
  private consultationEventSubject = new Subject<ConsultationEvent>();
  private stateSubscription: Subscription | null = null;
  private onlineSubscription: Subscription | null = null;
  private hadConnectionIssue = false;
  private wasConnected = false;
  private errorToastTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldBeConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectInterval = 5000; // 5 seconds between refresh attempts
  private isRefreshing = false;

  public isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable();
  public connectionCount$: Observable<number> =
    this.connectionCountSubject.asObservable();
  public messages$: Observable<UserMessageEvent> =
    this.messagesSubject.asObservable();
  public notifications$: Observable<NotificationEvent> =
    this.notificationsSubject.asObservable();
  public appointmentJoined$: Observable<AppointmentJoinedEvent> =
    this.appointmentJoinedSubject.asObservable();
  public consultationEvent$: Observable<ConsultationEvent> =
    this.consultationEventSubject.asObservable();

  constructor(
    private wsService: WebSocketService,
    private authService: Auth,
    private toasterService: ToasterService,
    private t: TranslationService,
    private offlineService: OfflineService
  ) {
    this.setupEventListeners();
    this.setupConnectionStatusToasts();
    this.setupOnlineStatusListener();
    this.setupReconnectionHandler();
  }

  connect(): void {
    this.shouldBeConnected = true;
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
      reconnect: false, // We handle reconnection ourselves
      pingInterval: 30000,
    });
  }

  disconnect(): void {
    this.shouldBeConnected = false;
    this.wasConnected = false;
    this.hadConnectionIssue = false;
    this.clearReconnectTimer();
    this.clearErrorToastTimer();
    this.wsService.disconnect();
    this.isOnlineSubject.next(false);
    this.connectionCountSubject.next(0);
  }

  private setupReconnectionHandler(): void {
    this.wsService.state$.subscribe(state => {
      if ((state === WebSocketState.DISCONNECTED || state === WebSocketState.FAILED) && this.shouldBeConnected) {
        this.attemptReconnect();
      } else if (state === WebSocketState.CONNECTED) {
        this.clearReconnectTimer();
      }
    });
  }

  private attemptReconnect(): void {
    // Avoid multiple simultaneous refresh attempts
    if (this.isRefreshing) {
      return;
    }

    this.clearReconnectTimer();
    this.hadConnectionIssue = true;

    // Show reconnecting toast immediately (only if we were previously connected)
    if (this.wasConnected) {
      this.clearErrorToastTimer();
      this.toasterService.show(
        'warning',
        this.t.instant('websocket.reconnecting'),
        this.t.instant('websocket.reconnectingMessage'),
        { id: WS_CONNECTION_TOAST_ID, delay: -1, closable: false }
      );
    }

    this.tryRefresh();
  }

  private async tryRefresh(): Promise<void> {
    this.isRefreshing = true;

    // Check if we have a refresh token before attempting
    const refreshToken = this.authService.getRefreshToken();
    if (!refreshToken) {
      console.error('[UserWS] No refresh token available, stopping reconnection');
      this.isRefreshing = false;
      return;
    }

    try {
      const response = await firstValueFrom(this.authService.refreshAccessToken());
      this.authService.setToken(response.access);
      if (response.refresh) {
        this.authService.setRefreshToken(response.refresh);
      }
      // Refresh succeeded, reconnect WebSocket
      this.isRefreshing = false;
      this.connect();
    } catch (error: unknown) {
      const httpError = error as { status?: number };

      // If token is expired/invalid (401/403), stop reconnection
      // The auth interceptor will handle logout
      if (httpError?.status === 401 || httpError?.status === 403) {
        console.error('[UserWS] Refresh token expired, stopping reconnection');
        this.isRefreshing = false;
        return;
      }

      // For network errors, keep trying after interval
      console.error('[UserWS] Token refresh failed, will retry:', error);
      this.reconnectTimer = setTimeout(() => {
        this.isRefreshing = false;
        this.tryRefresh();
      }, this.reconnectInterval);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
      .subscribe(event => {
        const statusEvent = event as StatusChangedEvent;
        this.isOnlineSubject.next(statusEvent.data.is_online);
        this.connectionCountSubject.next(statusEvent.data.connection_count);
      });

    this.wsService.on('user_message').subscribe(event => {
      this.messagesSubject.next(event as UserMessageEvent);
    });

    this.wsService.on('notification').subscribe(event => {
      const notificationEvent = event as NotificationEvent;
      console.log('[UserWS] Notification event received:', notificationEvent);
      this.notificationsSubject.next(notificationEvent);
    });

    this.wsService
      .on('appointment')
      .subscribe(event => {
        const appointmentEvent = event as AppointmentJoinedEvent;
        console.log('[UserWS] Appointment event received:', appointmentEvent);
        if (appointmentEvent.state === 'participant_joined') {
          console.log('[UserWS] participant_joined - showing incoming call');
          this.appointmentJoinedSubject.next(appointmentEvent);
        }
      });

    this.wsService
      .on('consultation')
      .subscribe(event => {
        const consultationEvent = event as ConsultationEvent;
        console.log('[UserWS] Consultation event received:', consultationEvent);
        this.consultationEventSubject.next(consultationEvent);
      });

    this.wsService.on('error').subscribe(event => {
      const errorEvent = event as { message: string };
      console.error('WebSocket error:', errorEvent.message);
    });
  }

  private setupOnlineStatusListener(): void {
    // Listen to backend online/offline events to retry connection when backend comes back
    this.onlineSubscription = this.offlineService.backendOnline$
      .pipe(
        distinctUntilChanged(),
        debounceTime(1000), // Wait 1s after backend comes back before reconnecting
        filter(isOnline => isOnline && this.shouldBeConnected)
      )
      .subscribe(() => {
        const state = this.wsService.getState();
        // If websocket is in failed or disconnected state, try to reconnect
        if (
          state === WebSocketState.FAILED ||
          (state === WebSocketState.DISCONNECTED && this.hadConnectionIssue)
        ) {
          console.log('[UserWS] Backend is back online, attempting to reconnect websocket...');
          this.connect();
        }
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
            // FAILED can be transient during reconnection attempts.
            // Defer the toast with a longer delay (5s) so RECONNECTING can cancel it.
            // If we stay in FAILED for 5s, it means all retry attempts are exhausted.
            this.scheduleErrorToast(
              this.t.instant('websocket.failed'),
              this.t.instant('websocket.failedMessage')
            );
            break;

          case WebSocketState.DISCONNECTED:
            // Only show error if we were previously connected and are not already handling reconnection
            if (this.wasConnected && !this.hadConnectionIssue) {
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
            if (this.hadConnectionIssue && this.wasConnected) {
              this.toasterService.show(
                'success',
                this.t.instant('websocket.reconnected'),
                this.t.instant('websocket.reconnectedMessage'),
                { id: WS_CONNECTION_TOAST_ID, delay: 5000, closable: true }
              );
            }
            this.hadConnectionIssue = false;
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
        actions: [
          {
            label: this.t.instant('common.refresh'),
            callback: () => {
              window.location.reload();
            },
          },
        ],
      });
    }, 5000);
  }

  private clearErrorToastTimer(): void {
    if (this.errorToastTimer) {
      clearTimeout(this.errorToastTimer);
      this.errorToastTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearReconnectTimer();
    this.stateSubscription?.unsubscribe();
    this.onlineSubscription?.unsubscribe();
    this.disconnect();
  }
}

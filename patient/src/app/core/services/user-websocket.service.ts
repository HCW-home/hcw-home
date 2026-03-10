import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import { WebSocketService } from './websocket.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import {
  WebSocketState,
  UserMessageEvent,
  NotificationEvent,
  StatusChangedEvent,
  AppointmentJoinedEvent,
  AppointmentChangedEvent,
  ConsultationChangedEvent,
} from '../models/websocket.model';

@Injectable({
  providedIn: 'root',
})
export class UserWebSocketService implements OnDestroy {
  private isOnlineSubject = new BehaviorSubject<boolean>(false);
  private connectionCountSubject = new BehaviorSubject<number>(0);
  private messagesSubject = new Subject<UserMessageEvent>();
  private notificationsSubject = new Subject<NotificationEvent>();
  private appointmentJoinedSubject = new Subject<AppointmentJoinedEvent>();
  private appointmentChangedSubject = new Subject<AppointmentChangedEvent>();
  private consultationChangedSubject = new Subject<ConsultationChangedEvent>();

  public messages$: Observable<UserMessageEvent> = this.messagesSubject.asObservable();
  public notifications$: Observable<NotificationEvent> = this.notificationsSubject.asObservable();
  public appointmentJoined$: Observable<AppointmentJoinedEvent> = this.appointmentJoinedSubject.asObservable();
  public appointmentChanged$: Observable<AppointmentChangedEvent> = this.appointmentChangedSubject.asObservable();
  public consultationChanged$: Observable<ConsultationChangedEvent> = this.consultationChangedSubject.asObservable();

  constructor(
    private wsService: WebSocketService,
    private authService: AuthService
  ) {
    this.setupEventListeners();
  }

  async connect(): Promise<void> {
    const state = this.wsService.getState();
    if (state === WebSocketState.CONNECTED || state === WebSocketState.CONNECTING) {
      return;
    }

    const token = await this.authService.getToken();
    if (!token) {
      return;
    }

    const wsUrl = `${environment.wsUrl}/user/?token=${token}`;
    this.wsService.connect({
      url: wsUrl,
      urlProvider: async () => {
        try {
          const response = await firstValueFrom(this.authService.refreshToken());
          return response.access ? `${environment.wsUrl}/user/?token=${response.access}` : null;
        } catch {
          // If refresh fails (e.g., backend down), return URL with current token
          // to allow reconnection attempts to continue
          const currentToken = await this.authService.getToken();
          return currentToken ? `${environment.wsUrl}/user/?token=${currentToken}` : null;
        }
      },
      reconnect: true,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
      pingInterval: 30000,
    });
  }

  disconnect(): void {
    this.wsService.disconnect();
    this.isOnlineSubject.next(false);
    this.connectionCountSubject.next(0);
  }

  getConnectionState(): Observable<WebSocketState> {
    return this.wsService.state$;
  }

  isConnected(): boolean {
    return this.wsService.isConnected;
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
    this.wsService.on('status_changed').subscribe((event: StatusChangedEvent) => {
      this.isOnlineSubject.next(event.data.is_online);
      this.connectionCountSubject.next(event.data.connection_count);
    });

    this.wsService.on('user_message').subscribe((event: UserMessageEvent) => {
      this.messagesSubject.next(event);
    });

    this.wsService.on('notification').subscribe((event: NotificationEvent) => {
      this.notificationsSubject.next(event);
    });

    this.wsService.on('appointment').subscribe((raw) => {
      const event = raw as AppointmentJoinedEvent | AppointmentChangedEvent;
      console.log('[UserWS] Appointment event received:', event);
      if (event.state === 'participant_joined') {
        console.log('[UserWS] participant_joined - showing incoming call');
        this.appointmentJoinedSubject.next(event as AppointmentJoinedEvent);
      } else {
        this.appointmentChangedSubject.next(event as AppointmentChangedEvent);
      }
    });

    this.wsService.on('consultation').subscribe((raw) => {
      const event = raw as ConsultationChangedEvent;
      console.log('[UserWS] Consultation event received:', event);
      this.consultationChangedSubject.next(event);
    });

    this.wsService.on('error').subscribe((event) => {
      console.error('WebSocket error:', (event as { message: string }).message);
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

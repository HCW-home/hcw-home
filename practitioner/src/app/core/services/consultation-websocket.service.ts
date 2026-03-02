import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserWebSocketService } from './user-websocket.service';
import { WebSocketService } from './websocket.service';
import {
  WebSocketState,
  ConsultationMessageEvent,
  MessageEvent as WsMessageEvent,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  AppointmentUpdatedEvent,
  UserOnlineStatusEvent,
  ConsultationParticipant,
  ConsultationIncomingEvent,
  ConsultationEvent,
} from '../models/websocket';

@Injectable({
  providedIn: 'root',
})
export class ConsultationWebSocketService implements OnDestroy {
  private consultationId: number | null = null;
  private destroy$ = new Subject<void>();

  private messagesSubject = new Subject<ConsultationMessageEvent>();
  private messageUpdatedSubject = new Subject<WsMessageEvent>();
  private participantsSubject = new BehaviorSubject<ConsultationParticipant[]>(
    []
  );
  private participantJoinedSubject = new Subject<ParticipantJoinedEvent>();
  private participantLeftSubject = new Subject<ParticipantLeftEvent>();
  private appointmentUpdatedSubject = new Subject<AppointmentUpdatedEvent>();
  private userOnlineStatusSubject = new Subject<UserOnlineStatusEvent>();
  private consultationUpdatedSubject = new Subject<ConsultationEvent>();
  private allEventsSubject = new Subject<ConsultationIncomingEvent>();

  public state$: Observable<WebSocketState>;
  public messages$: Observable<ConsultationMessageEvent> =
    this.messagesSubject.asObservable();
  public messageUpdated$: Observable<WsMessageEvent> =
    this.messageUpdatedSubject.asObservable();
  public participants$: Observable<ConsultationParticipant[]> =
    this.participantsSubject.asObservable();
  public participantJoined$: Observable<ParticipantJoinedEvent> =
    this.participantJoinedSubject.asObservable();
  public participantLeft$: Observable<ParticipantLeftEvent> =
    this.participantLeftSubject.asObservable();
  public appointmentUpdated$: Observable<AppointmentUpdatedEvent> =
    this.appointmentUpdatedSubject.asObservable();
  public userOnlineStatus$: Observable<UserOnlineStatusEvent> =
    this.userOnlineStatusSubject.asObservable();
  public consultationUpdated$: Observable<ConsultationEvent> =
    this.consultationUpdatedSubject.asObservable();
  public allEvents$: Observable<ConsultationIncomingEvent> =
    this.allEventsSubject.asObservable();

  constructor(
    private userWsService: UserWebSocketService,
    private wsService: WebSocketService
  ) {
    this.state$ = this.userWsService.getConnectionState();
    this.setupEventListeners();
  }

  connect(consultationId: number): void {
    if (this.consultationId === consultationId) {
      return;
    }

    this.consultationId = consultationId;
  }

  disconnect(): void {
    this.consultationId = null;
    this.participantsSubject.next([]);
  }

  send(message: unknown): void {
    this.wsService.send(message as Parameters<typeof this.wsService.send>[0]);
  }

  isConnected(): boolean {
    return this.userWsService.isConnected();
  }

  private setupEventListeners(): void {
    this.wsService.messages$.pipe(takeUntil(this.destroy$)).subscribe(event => {
      this.handleMessage(event as unknown as ConsultationIncomingEvent);
    });
  }

  private handleMessage(message: ConsultationIncomingEvent): void {
    this.allEventsSubject.next(message);

    const msgAny = message as unknown as Record<string, unknown>;
    const consultationId = msgAny['consultation_id'] as number | undefined;

    if (
      consultationId &&
      this.consultationId &&
      consultationId !== this.consultationId
    ) {
      return;
    }

    const eventType = msgAny['event'] as string | undefined;
    const messageType = msgAny['type'] as string | undefined;

    if (eventType === 'message') {
      this.messageUpdatedSubject.next(message as WsMessageEvent);
      return;
    }

    if (eventType === 'consultation') {
      this.consultationUpdatedSubject.next(message as ConsultationEvent);
      return;
    }

    if (eventType === 'appointment') {
      const state = msgAny['state'] as string | undefined;
      if (state && state !== 'participant_joined' && state !== 'created') {
        this.appointmentUpdatedSubject.next(message as AppointmentUpdatedEvent);
      }
      return;
    }

    if (eventType === 'user') {
      this.userOnlineStatusSubject.next(
        message as unknown as UserOnlineStatusEvent
      );
      return;
    }

    switch (messageType) {
      case 'consultation_message':
        this.messagesSubject.next(message as ConsultationMessageEvent);
        break;

      case 'participant_joined':
        this.participantJoinedSubject.next(message as ParticipantJoinedEvent);
        break;

      case 'participant_left':
        this.participantLeftSubject.next(message as ParticipantLeftEvent);
        break;

      case 'participants':
        this.participantsSubject.next(
          (message as { data: ConsultationParticipant[] }).data
        );
        break;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
  }
}

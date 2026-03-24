import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, filter } from 'rxjs';
import {
  WebSocketState,
  UserOutgoingMessage,
  UserIncomingEvent,
  WebSocketConfig,
} from '../models/websocket.model';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig | null = null;

  private stateSubject = new BehaviorSubject<WebSocketState>(WebSocketState.DISCONNECTED);
  private messageSubject = new Subject<UserIncomingEvent>();

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectInterval = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: UserOutgoingMessage[] = [];

  public state$: Observable<WebSocketState> = this.stateSubject.asObservable();
  public messages$: Observable<UserIncomingEvent> = this.messageSubject.asObservable();

  connect(config: WebSocketConfig): void {
    if (this.ws &&
        (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.disconnect();
    this.config = config;
    this.stateSubject.next(WebSocketState.CONNECTING);

    try {
      console.log('Creating new WebSocket connection...');
      this.ws = new WebSocket(config.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.stateSubject.next(WebSocketState.FAILED);
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    this.clearTimers();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.stateSubject.next(WebSocketState.DISCONNECTED);
    this.messageQueue = [];
  }

  send<T extends UserOutgoingMessage>(message: T): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.messageQueue.push(message);
      }
    } else {
      this.messageQueue.push(message);
    }
  }

  on<T extends UserIncomingEvent['type']>(
    type: T
  ): Observable<Extract<UserIncomingEvent, { type: T }>> {
    return this.messages$.pipe(
      filter((msg): msg is Extract<UserIncomingEvent, { type: T }> =>
        msg.type === type || (msg as unknown as { event?: string }).event === type
      )
    );
  }

  ping(): void {
    this.send({
      type: 'ping',
      timestamp: Date.now(),
    });
  }

  joinGroup(groupName: string): void {
    this.send({
      type: 'join_group',
      data: { group_name: groupName },
    });
  }

  leaveGroup(groupName: string): void {
    this.send({
      type: 'leave_group',
      data: { group_name: groupName },
    });
  }

  getState(): WebSocketState {
    return this.stateSubject.value;
  }

  get isConnected(): boolean {
    return this.stateSubject.value === WebSocketState.CONNECTED;
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.stateSubject.next(WebSocketState.CONNECTED);
      this.reconnectAttempts = 0;
      this.flushMessageQueue();

      if (this.config?.pingInterval) {
        this.startPingInterval(this.config.pingInterval);
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        // Respond to server-side heartbeat pings automatically
        if (message.type === 'ping') {
          this.send({ type: 'pong' } as unknown as UserOutgoingMessage);
          return;
        }


        console.log('[WS] Received message:', message);
        this.messageSubject.next(message as UserIncomingEvent);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onerror = () => {
      this.stateSubject.next(WebSocketState.FAILED);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.clearTimers();

      if (event.code !== 1000 && this.config?.reconnect !== false) {
        this.stateSubject.next(WebSocketState.RECONNECTING);
        this.attemptReconnect();
      } else {
        this.stateSubject.next(WebSocketState.DISCONNECTED);
      }
    };
  }

  private attemptReconnect(): void {
    if (!this.config) return;

    const maxAttempts = this.config.reconnectAttempts ?? this.maxReconnectAttempts;

    if (this.reconnectAttempts >= maxAttempts) {
      this.stateSubject.next(WebSocketState.FAILED);
      return;
    }

    this.reconnectAttempts++;
    const interval = this.config.reconnectInterval ?? this.reconnectInterval;

    this.reconnectTimer = setTimeout(async () => {
      if (!this.config) return;

      if (this.config.urlProvider) {
        const freshUrl = await this.config.urlProvider();
        if (freshUrl) {
          this.config = { ...this.config, url: freshUrl };
          // Reset reconnect attempts when we get a fresh URL (successful token refresh)
          // This allows infinite reconnection attempts as long as token refresh works
          if (freshUrl !== this.config.url) {
            this.reconnectAttempts = 0;
          }
        } else {
          this.stateSubject.next(WebSocketState.FAILED);
          return;
        }
      }

      this.connect(this.config);
    }, interval);
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach(message => {
      this.send(message);
    });
  }

  private startPingInterval(interval: number): void {
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        this.ping();
      }
    }, interval);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

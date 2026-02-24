import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  WebSocketState,
  WebSocketConfig,
  UserIncomingEvent,
  UserOutgoingMessage,
} from '../models/websocket';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig | null = null;

  private stateSubject = new BehaviorSubject<WebSocketState>(
    WebSocketState.DISCONNECTED
  );
  private messageSubject = new Subject<UserIncomingEvent>();

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectInterval = 3000; // 3 seconds
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: UserOutgoingMessage[] = [];

  public state$: Observable<WebSocketState> = this.stateSubject.asObservable();
  public messages$: Observable<UserIncomingEvent> =
    this.messageSubject.asObservable();

  connect(config: WebSocketConfig): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.disconnect();
    this.config = config;
    this.stateSubject.next(WebSocketState.CONNECTING);

    try {
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
        console.error('Error sending WebSocket message:', error);
        this.messageQueue.push(message);
      }
    } else {
      this.messageQueue.push(message);
      console.warn('WebSocket not connected, message queued');
    }
  }

  on<T extends UserIncomingEvent['type']>(
    type: T
  ): Observable<Extract<UserIncomingEvent, { type: T }>> {
    return this.messages$.pipe(
      filter(
        (msg): msg is Extract<UserIncomingEvent, { type: T }> =>
          msg.type === type ||
          (msg as unknown as { event?: string }).event === type
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

  isConnected(): boolean {
    return this.stateSubject.value === WebSocketState.CONNECTED;
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.stateSubject.next(WebSocketState.CONNECTED);
      this.reconnectAttempts = 0;

      this.flushMessageQueue();

      if (this.config?.pingInterval) {
        this.startPingInterval(this.config.pingInterval);
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const raw = JSON.parse(event.data) as { type: string };

        // Reply to server-side heartbeat pings immediately
        if (raw.type === 'ping') {
          this.ws?.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        const message = raw as UserIncomingEvent;
        console.log('[WS] Received message:', message);
        this.messageSubject.next(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error: Event) => {
      console.error('WebSocket error:', error);
      this.stateSubject.next(WebSocketState.FAILED);
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log('WebSocket closed:', event.code, event.reason);
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

    const maxAttempts =
      this.config.reconnectAttempts ?? this.maxReconnectAttempts;

    if (this.reconnectAttempts >= maxAttempts) {
      console.error('Max reconnection attempts reached');
      this.stateSubject.next(WebSocketState.FAILED);
      return;
    }

    this.reconnectAttempts++;
    const interval = this.config.reconnectInterval ?? this.reconnectInterval;

    console.log(
      `Reconnecting in ${interval}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`
    );

    this.reconnectTimer = setTimeout(async () => {
      if (!this.config) return;

      if (this.config.urlProvider) {
        const freshUrl = await this.config.urlProvider();
        if (freshUrl) {
          this.config = { ...this.config, url: freshUrl };
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

    console.log(`Flushing ${this.messageQueue.length} queued messages`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach(message => {
      this.send(message);
    });
  }

  private startPingInterval(interval: number): void {
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
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
}

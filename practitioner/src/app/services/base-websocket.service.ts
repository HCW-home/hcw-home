import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface BaseWebSocketConfig {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
}

export interface ConnectionState {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastConnected?: Date;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export abstract class BaseWebSocketService {
  protected socket: Socket | null = null;
  protected connectionState$ = new BehaviorSubject<ConnectionState>({
    status: 'disconnected'
  });

  protected readonly defaultConfig: BaseWebSocketConfig = {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
  };

  constructor() { }

  /**
   * Get connection state observable
   */
  getConnectionState(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  /**
   * Create socket connection with common configuration
   */
  protected createSocket(
    namespace: string = '',
    query: Record<string, any> = {},
    config: BaseWebSocketConfig = {}
  ): Socket {
    const finalConfig = { ...this.defaultConfig, ...config };
    const url = namespace ? `${environment.wsUrl}${namespace}` : environment.wsUrl;

    return io(url, {
      query,
      autoConnect: finalConfig.autoConnect,
      reconnection: finalConfig.reconnection,
      reconnectionAttempts: finalConfig.reconnectionAttempts,
      reconnectionDelay: finalConfig.reconnectionDelay,
      timeout: finalConfig.timeout,
      transports: ['websocket']
    });
  }

  /**
   * Setup common connection event handlers
   */
  protected setupConnectionHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.connectionState$.next({
        status: 'connected',
        lastConnected: new Date()
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionState$.next({ status: 'disconnected' });
    });

    this.socket.on('connect_error', (error) => {
      this.connectionState$.next({
        status: 'error',
        error: error.message
      });
    });

    this.socket.on('reconnect', () => {
      this.connectionState$.next({
        status: 'connected',
        lastConnected: new Date()
      });
    });
  }

  /**
   * Emit event to server
   */
  protected emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  /**
   * Listen to server events
   */
  protected on<T = any>(event: string): Observable<T> {
    return new Observable(observer => {
      if (!this.socket) {
        observer.error(new Error('Socket not initialized'));
        return;
      }

      this.socket.on(event, (data: T) => observer.next(data));

      return () => {
        this.socket?.off(event);
      };
    });
  }

  /**
   * Disconnect socket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionState$.next({ status: 'disconnected' });
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

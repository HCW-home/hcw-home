import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  id?: number | string;
  consultationId: number;
  userId: number;
  content: string;
  createdAt?: string;
  messageType?: 'text' | 'image' | 'file' | 'system';
  userName?: string;
  isFromPractitioner?: boolean;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  readReceipts?: Array<{
    id: number;
    userId: number;
    readAt: string;
    user: {
      id: number;
      firstName: string;
      lastName: string;
    };
  }>;
  deliveryStatus?: 'pending' | 'sent' | 'read';
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private socket: Socket | null = null;
  private connected$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.connect();
  }

  private connect(): void {
    this.socket = io(environment.wsUrl + '/chat', {
      transports: ['websocket'],
      auth: { token: localStorage.getItem('authToken') }
    });
    this.socket.on('connect', () => this.connected$.next(true));
    this.socket.on('disconnect', () => this.connected$.next(false));
  }

  public sendMessage(message: ChatMessage): void {
    this.socket?.emit('send_message', message);
  }

  public sendTyping(consultationId: number, userId: number): void {
    this.socket?.emit('user_typing', { consultationId, userId });
  }

  public sendReadReceipt(consultationId: number, messageId: number, userId: number): void {
    this.socket?.emit('message_read', { consultationId, messageId, userId });
  }

  public onTyping(): Observable<any> {
    return new Observable(observer => {
      this.socket?.on('user_typing', (data: any) => observer.next(data));
      return () => this.socket?.off('user_typing');
    });
  }

  public onReadReceipt(): Observable<any> {
    return new Observable(observer => {
      this.socket?.on('message_read', (data: any) => observer.next(data));
      return () => this.socket?.off('message_read');
    });
  }

  public onNewMessage(): Observable<ChatMessage> {
    return new Observable(observer => {
      this.socket?.on('new_message', (data: any) => observer.next(data.message));
      return () => this.socket?.off('new_message');
    });
  }

  public getConnectionState(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  public disconnect(): void {
    this.socket?.disconnect();
    this.connected$.next(false);
  }
}

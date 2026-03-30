import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface EnhancedWebSocketEvent {
  event: string;
  data: any;
  timestamp: Date;
  namespace: string;
}

export interface WebSocketConfig {
  autoConnect: boolean;
  reconnection: boolean;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  enableHeartbeat: boolean;
  heartbeatInterval: number;
}

@Injectable({
  providedIn: 'root'
})
export class PractitionerEnhancedWebSocketService implements OnDestroy {
  private enhancedConsultationSocket: Socket | null = null;
  private destroy$ = new Subject<void>();

  // Event subjects for enhanced real-time features
  private patientWaitingSubject = new Subject<any>();
  private participantInvitedSubject = new Subject<any>();
  private participantRemovedSubject = new Subject<any>();
  private mediaPermissionGuidanceSubject = new Subject<any>();
  private systemNotificationSubject = new Subject<any>();
  private recentEventsSubject = new BehaviorSubject<any[]>([]);
  private typingIndicatorsSubject = new BehaviorSubject<any[]>([]);
  private waitingRoomSessionsSubject = new BehaviorSubject<any[]>([]);

  private readonly defaultConfig: WebSocketConfig = {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    enableHeartbeat: true,
    heartbeatInterval: 30000
  };

  constructor() { }

  private connectionState$ = new BehaviorSubject<{ status: string, lastConnected?: Date }>({
    status: 'disconnected'
  });

  // Public observables
  get connectionState(): Observable<{ status: string, lastConnected?: Date }> {
    return this.connectionState$.asObservable();
  }
  get patientWaiting$(): Observable<any> {
    return this.patientWaitingSubject.asObservable();
  }

  get participantInvited$(): Observable<any> {
    return this.participantInvitedSubject.asObservable();
  }

  get participantRemoved$(): Observable<any> {
    return this.participantRemovedSubject.asObservable();
  }

  get mediaPermissionGuidance$(): Observable<any> {
    return this.mediaPermissionGuidanceSubject.asObservable();
  }

  get systemNotification$(): Observable<any> {
    return this.systemNotificationSubject.asObservable();
  }

  get recentEvents$(): Observable<any[]> {
    return this.recentEventsSubject.asObservable();
  }

  get typingIndicators$(): Observable<any[]> {
    return this.typingIndicatorsSubject.asObservable();
  }

  get waitingRoomSessions$(): Observable<any[]> {
    return this.waitingRoomSessionsSubject.asObservable();
  }

  /**
   * Initialize enhanced consultation WebSocket connection
   */
  async initializeEnhancedConsultation(
    consultationId: number,
    userId: number,
    userRole: string,
    config: Partial<WebSocketConfig> = {}
  ): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      if (this.enhancedConsultationSocket) {
        this.enhancedConsultationSocket.disconnect();
      }

      this.enhancedConsultationSocket = io(`${environment.socketUrl}/consultation`, {
        query: {
          consultationId: consultationId.toString(),
          userId: userId.toString(),
          userRole
        },
        autoConnect: finalConfig.autoConnect,
        reconnection: finalConfig.reconnection,
        reconnectionAttempts: finalConfig.reconnectionAttempts,
        reconnectionDelay: finalConfig.reconnectionDelay,
        timeout: 10000
      });

      this.setupEnhancedEventHandlers();

      if (finalConfig.autoConnect) {
        this.enhancedConsultationSocket.connect();
      }

      console.log(`[PractitionerEnhancedWebSocket] Enhanced consultation socket initialized for consultation ${consultationId}`);

    } catch (error) {
      console.error('[PractitionerEnhancedWebSocket] Failed to initialize enhanced consultation socket:', error);
      throw error;
    }
  }

  /**
   * Setup event handlers for enhanced consultation features
   */
  private setupEnhancedEventHandlers(): void {
    if (!this.enhancedConsultationSocket) return;

    // Connection events
    this.enhancedConsultationSocket.on('connect', () => {
      console.log('[PractitionerEnhancedWebSocket] Enhanced consultation connected');
      this.connectionState$.next({ status: 'connected', lastConnected: new Date() });
    });

    this.enhancedConsultationSocket.on('disconnect', (reason) => {
      console.log('[PractitionerEnhancedWebSocket] Enhanced consultation disconnected:', reason);
      this.connectionState$.next({ status: 'disconnected' });
    });

    this.enhancedConsultationSocket.on('reconnect', () => {
      console.log('[PractitionerEnhancedWebSocket] Enhanced consultation reconnected');
      this.connectionState$.next({ status: 'connected', lastConnected: new Date() });
    });

    this.enhancedConsultationSocket.on('connect_error', (error) => {
      console.error('[PractitionerEnhancedWebSocket] Connection error:', error);
      this.connectionState$.next({ status: 'error' });
    });

    // Waiting room events
    this.enhancedConsultationSocket.on('patient_waiting', (data) => {
      console.log('[PractitionerEnhancedWebSocket] Patient waiting:', data);
      this.patientWaitingSubject.next(data);
    });

    this.enhancedConsultationSocket.on('waiting_room_sessions', (data) => {
      console.log('[PractitionerEnhancedWebSocket] Waiting room sessions:', data);
      this.waitingRoomSessionsSubject.next(data);
    });

    // Participant management events
    this.enhancedConsultationSocket.on('participant_invited', (data) => {
      console.log('[PractitionerEnhancedWebSocket] Participant invited:', data);
      this.participantInvitedSubject.next(data);
    });

    this.enhancedConsultationSocket.on('participant_removed_notification', (data) => {
      console.log('[PractitionerEnhancedWebSocket] Participant removed:', data);
      this.participantRemovedSubject.next(data);
    });

    // Media permission guidance
    this.enhancedConsultationSocket.on('media_permission_guidance', (data) => {
      console.log('[PractitionerEnhancedWebSocket] Media permission guidance:', data);
      this.mediaPermissionGuidanceSubject.next(data);
    });

    // System notifications
    this.enhancedConsultationSocket.on('system_notification', (data) => {
      console.log('[PractitionerEnhancedWebSocket] System notification:', data);
      this.systemNotificationSubject.next(data);
    });

    // Real-time events
    this.enhancedConsultationSocket.on('recent_events', (data) => {
      console.log('[PractitionerEnhancedWebSocket] Recent events:', data);
      this.recentEventsSubject.next(data);
    });

    // Typing indicators
    this.enhancedConsultationSocket.on('typing_indicators', (data) => {
      console.log('[PractitionerEnhancedWebSocket] Typing indicators:', data);
      this.typingIndicatorsSubject.next(data);
    });

    this.enhancedConsultationSocket.on('user_typing', (data) => {
      console.log('[PractitionerEnhancedWebSocket] User typing:', data);
      const current = this.typingIndicatorsSubject.value;
      const updated = current.filter(t => t.userId !== data.userId);
      if (data.isTyping) {
        updated.push(data);
      }
      this.typingIndicatorsSubject.next(updated);
    });

    // Enhanced message events
    this.enhancedConsultationSocket.on('new_message', (data) => {
      console.log('[PractitionerEnhancedWebSocket] New enhanced message:', data);
      // This would integrate with your existing chat service
    });

    // Error handling
    this.enhancedConsultationSocket.on('error', (error) => {
      console.error('[PractitionerEnhancedWebSocket] Socket error:', error);
    });
  }

  /**
   * Add participant to consultation
   */
  async addParticipant(participantData: {
    role: 'EXPERT' | 'GUEST';
    email: string;
    firstName: string;
    lastName: string;
    notes?: string;
  }): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.enhancedConsultationSocket?.emit('add_participant', participantData, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Remove participant from consultation
   */
  async removeParticipant(participantId: number, reason?: string): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.enhancedConsultationSocket?.emit('remove_participant',
        { participantId, reason },
        (response: any) => {
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Admit patient from waiting room
   */
  async admitPatient(patientId: number): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.enhancedConsultationSocket?.emit('admit_patient',
        { patientId },
        (response: any) => {
          if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Update media device status
   */
  async updateMediaDeviceStatus(status: {
    cameraAvailable?: boolean;
    cameraEnabled?: boolean;
    cameraBlocked?: boolean;
    microphoneAvailable?: boolean;
    microphoneEnabled?: boolean;
    microphoneBlocked?: boolean;
  }): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    this.enhancedConsultationSocket.emit('update_media_device_status', status);
  }

  /**
   * Update connection quality
   */
  async updateConnectionQuality(quality: {
    packetLoss?: number;
    latency?: number;
    reconnectAttempts?: number;
    signalStrength?: number;
  }): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    this.enhancedConsultationSocket.emit('update_connection_quality', quality);
  }

  /**
   * Report media permission error
   */
  async reportMediaPermissionError(errorType: string, errorDetails: string): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    this.enhancedConsultationSocket.emit('media_permission_error', {
      errorType,
      errorDetails
    });
  }

  /**
   * Send enhanced message
   */
  async sendEnhancedMessage(messageData: {
    content: string;
    replyToId?: number;
    messageType?: string;
    mediaUrl?: string;
    fileName?: string;
    fileSize?: number;
  }): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    this.enhancedConsultationSocket.emit('send_message', messageData);
  }

  /**
   * Update typing indicator
   */
  updateTypingIndicator(isTyping: boolean): void {
    if (!this.enhancedConsultationSocket?.connected) return;

    this.enhancedConsultationSocket.emit('typing_indicator', { isTyping });
  }

  /**
   * Create system notification
   */
  async createSystemNotification(messageType: string, messageData?: any): Promise<void> {
    if (!this.enhancedConsultationSocket?.connected) {
      throw new Error('Enhanced consultation socket not connected');
    }

    this.enhancedConsultationSocket.emit('create_system_notification', {
      messageType,
      messageData
    });
  }

  /**
   * Check if enhanced consultation socket is connected
   */
  isEnhancedConsultationConnected(): boolean {
    return this.enhancedConsultationSocket?.connected || false;
  }

  /**
   * Disconnect enhanced consultation socket
   */
  disconnectEnhancedConsultation(): void {
    if (this.enhancedConsultationSocket) {
      this.enhancedConsultationSocket.disconnect();
      this.enhancedConsultationSocket = null;
      console.log('[PractitionerEnhancedWebSocket] Enhanced consultation disconnected');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.disconnectEnhancedConsultation();
  }
}

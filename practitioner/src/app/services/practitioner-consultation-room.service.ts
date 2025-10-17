import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { firstValueFrom } from 'rxjs';

export interface PractitionerConsultationState {
  consultationId: number;
  isConnected: boolean;
  patientPresent: boolean;
  patientName: string;
  patientLanguage: string | null;
  sessionStatus: 'connecting' | 'waiting' | 'active' | 'ended' | 'error';
  participantCount: number;
  consultationStartTime: Date | null;
  mediaStatus: {
    videoEnabled: boolean;
    audioEnabled: boolean;
    screenShareEnabled: boolean;
  };
  waitingRoomStatus: {
    hasWaitingPatients: boolean;
    waitingCount: number;
  };
}

export interface PractitionerMediaSessionState {
  routerId: string;
  rtpCapabilities: any;
  canJoinMedia: boolean;
  mediaInitialized: boolean;
  connectionQuality: 'good' | 'fair' | 'poor' | 'disconnected';
  devices: {
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
    speakers: MediaDeviceInfo[];
  };
}

export interface ChatMessage {
  id: number;
  consultationId: number;
  content: string;
  senderId: number;
  senderName: string;
  timestamp: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  userId: number;
  userName?: string;
  isFromPractitioner?: boolean;
  readBy?: { userId: number; readAt: string }[];
  createdAt?: string;
  fileName?: string;
  fileSize?: number;
  filePath?: string;
  deliveryStatus?: 'pending' | 'sent' | 'read'; // New property for checkmarks
}

export interface TypingUser {
  userId: number;
  userName: string;
  isTyping: boolean;
  messageType: 'user' | 'system';
  isFromPractitioner?: boolean;
}

export interface ConsultationParticipant {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  inWaitingRoom?: boolean;
  joinedAt?: string;
  mediaStatus?: {
    videoEnabled: boolean;
    audioEnabled: boolean;
  };
}

export interface PatientAdmissionRequest {
  consultationId: number;
  patientId?: number;
}

export interface ConsultationEndRequest {
  consultationId: number;
  reason?: string;
  notes?: string;
}

export interface WebSocketNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number | null; // in milliseconds, null for permanent
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: string;
  data?: any;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface ConsultationEvent {
  id: string;
  type: 'participant_joined' | 'participant_left' | 'message_received' | 'media_status_changed' | 'waiting_room_update' | 'consultation_status_changed' | 'connection_quality_changed';
  title: string;
  description: string;
  timestamp: Date;
  data?: any;
  severity: 'info' | 'success' | 'warning' | 'error';
}

@Injectable({
  providedIn: 'root'
})
export class PractitionerConsultationRoomService {
  /**
   * Generate a magic link for inviting a participant
   */
  async generateMagicLink(
    consultationId: number,
    participantData: {
      email: string;
      role: 'EXPERT' | 'GUEST' | 'PATIENT';
      name: string;
      notes?: string;
      expiresInMinutes?: number;
    }
  ): Promise<{ magicLink: string; token: string; expiresAt: string }> {
    try {
      const response = await this.http.post<{
        magicLink: string;
        token: string;
        expiresAt: string;
      }>(
        `${API_ENDPOINTS.CONSULTATION}/${consultationId}/magic-link`,
        participantData
      ).toPromise();
      return response as { magicLink: string; token: string; expiresAt: string };
    } catch (error) {
      console.error('[PractitionerConsultationRoomService] Failed to generate magic link:', error);
      throw new Error('Failed to generate magic link');
    }
  }
  private consultationId: number = 0;
  private consultationSocket: Socket | null = null;
  private mediasoupSocket: Socket | null = null;
  private chatSocket: Socket | null = null;

  // Media streams and WebRTC properties
  private localMediaStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private rtcPeerConnections: Map<string, RTCPeerConnection> = new Map();

  // File upload feedback subjects
  private fileUploadProgressSubject = new Subject<number>();
  private fileUploadErrorSubject = new Subject<string>();

  // State management with BehaviorSubjects
  private consultationStateSubject = new BehaviorSubject<PractitionerConsultationState>({
    consultationId: 0,
    isConnected: false,
    patientPresent: false,
    patientName: '',
    patientLanguage: null,
    sessionStatus: 'connecting',
    participantCount: 0,
    consultationStartTime: null,
    mediaStatus: {
      videoEnabled: false,
      audioEnabled: false,
      screenShareEnabled: false
    },
    waitingRoomStatus: {
      hasWaitingPatients: false,
      waitingCount: 0
    }
  });

  private mediaSessionStateSubject = new BehaviorSubject<PractitionerMediaSessionState>({
    routerId: '',
    rtpCapabilities: null,
    canJoinMedia: false,
    mediaInitialized: false,
    connectionQuality: 'disconnected',
    devices: {
      cameras: [],
      microphones: [],
      speakers: []
    }
  });

  private chatMessagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private participantsSubject = new BehaviorSubject<ConsultationParticipant[]>([]);


  // Enhanced chat features
  private typingUsersSubject = new BehaviorSubject<TypingUser[]>([]);
  private unreadCountSubject = new BehaviorSubject<number>(0);
  private showChatSubject = new BehaviorSubject<boolean>(false);


  // Event subjects for real-time notifications
  private patientJoinedSubject = new Subject<any>();
  private patientLeftSubject = new Subject<any>();
  private patientAdmittedSubject = new Subject<any>();

  // Enhanced notification system
  private notificationsSubject = new BehaviorSubject<WebSocketNotification[]>([]);
  private eventsSubject = new BehaviorSubject<ConsultationEvent[]>([]);
  private connectionStatusSubject = new BehaviorSubject<{
    consultation: boolean;
    chat: boolean;
    media: boolean;
  }>({ consultation: false, chat: false, media: false });
  private mediaSessionReadySubject = new Subject<any>();
  private connectionQualitySubject = new Subject<any>();
  private consultationEndedSubject = new Subject<any>();
  private waitingRoomUpdateSubject = new Subject<any>();

  constructor(private http: HttpClient) { }

  // Public observables for components to subscribe
  get consultationState$(): Observable<PractitionerConsultationState> {
    return this.consultationStateSubject.asObservable();
  }

  get mediaSessionState$(): Observable<PractitionerMediaSessionState> {
    return this.mediaSessionStateSubject.asObservable();
  }

  get chatMessages$(): Observable<ChatMessage[]> {
    return this.chatMessagesSubject.asObservable();
  }

  // File upload feedback observables
  get fileUploadProgress$(): Observable<number> {
    return this.fileUploadProgressSubject.asObservable();
  }
  get fileUploadError$(): Observable<string> {
    return this.fileUploadErrorSubject.asObservable();
  }

  get participants$(): Observable<ConsultationParticipant[]> {
    return this.participantsSubject.asObservable();
  }

  // Enhanced chat observables
  get typingUsers$(): Observable<TypingUser[]> {
    return this.typingUsersSubject.asObservable();
  }

  get unreadCount$(): Observable<number> {
    return this.unreadCountSubject.asObservable();
  }

  get showChat$(): Observable<boolean> {
    return this.showChatSubject.asObservable();
  }


  get patientJoined$(): Observable<any> {
    return this.patientJoinedSubject.asObservable();
  }

  get patientLeft$(): Observable<any> {
    return this.patientLeftSubject.asObservable();
  }

  get patientAdmitted$(): Observable<any> {
    return this.patientAdmittedSubject.asObservable();
  }

  get mediaSessionReady$(): Observable<any> {
    return this.mediaSessionReadySubject.asObservable();
  }

  get connectionQuality$(): Observable<any> {
    return this.connectionQualitySubject.asObservable();
  }

  get consultationEnded$(): Observable<any> {
    return this.consultationEndedSubject.asObservable();
  }

  get waitingRoomUpdate$(): Observable<any> {
    return this.waitingRoomUpdateSubject.asObservable();
  }

  // Enhanced notification getters
  get notifications$(): Observable<WebSocketNotification[]> {
    return this.notificationsSubject.asObservable();
  }

  get events$(): Observable<ConsultationEvent[]> {
    return this.eventsSubject.asObservable();
  }

  get connectionStatus$(): Observable<{ consultation: boolean; chat: boolean; media: boolean }> {
    return this.connectionStatusSubject.asObservable();
  }

  /**
   * Initialize practitioner consultation room with full backend integration
   */
  async initializePractitionerConsultationRoom(consultationId: number, practitionerId: number): Promise<void> {
    this.consultationId = consultationId;
    try {
      console.log(`[PractitionerConsultationRoomService] Initializing consultation room: ${consultationId}`);

      // Update consultation ID in state
      this.updateConsultationState({ consultationId });

      // Join consultation as practitioner via backend API
      const joinResponse = await this.joinConsultationAsPractitioner(consultationId, practitionerId);

      if (joinResponse && joinResponse.success) {
        await this.initializeWebSocketConnections(consultationId, practitionerId);

        this.loadInitialConsultationData(joinResponse);

        // Setup media devices
        await this.initializeMediaDevices();

        console.log(`[PractitionerConsultationRoomService] Consultation room initialized successfully`);
      } else {
        throw new Error('Failed to join consultation as practitioner');
      }
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to initialize consultation room:`, error);
      this.updateConsultationState({ sessionStatus: 'error' });
      throw error;
    }
  }

  /**
   * Join consultation as practitioner via backend API
   */
  private async joinConsultationAsPractitioner(consultationId: number, practitionerId: number): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post(`${API_ENDPOINTS.CONSULTATION}/${consultationId}/join/practitioner`, {
          userId: practitionerId
        })
      );

      console.log(`[PractitionerConsultationRoomService] Join response:`, response);
      return response;
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to join consultation:`, error);
      throw error;
    }
  }

  /**
   * Initialize WebSocket connections with enhanced reliability and monitoring
   */
  private async initializeWebSocketConnections(consultationId: number, practitionerId: number): Promise<void> {
    try {
      const wsBaseUrl = environment.socketUrl || environment.wsUrl || environment.baseUrl;

      // Enhanced connection options for better reliability
      const socketOptions = {
        transports: ['websocket'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: 5
      };

      // Initialize consultation WebSocket with enhanced options
      this.consultationSocket = io(`${wsBaseUrl}/consultation`, {
        ...socketOptions,
        query: {
          userId: practitionerId,
          role: 'PRACTITIONER',
          consultationId: consultationId
        }
      });

      // Initialize MediaSoup WebSocket with enhanced options
      this.mediasoupSocket = io(`${wsBaseUrl}/mediasoup`, {
        ...socketOptions,
        query: {
          userId: practitionerId,
          role: 'PRACTITIONER',
          consultationId: consultationId
        }
      });

      // Initialize Chat WebSocket with enhanced options
      this.chatSocket = io(`${wsBaseUrl}/chat`, {
        ...socketOptions,
        query: {
          userId: practitionerId,
          userRole: 'PRACTITIONER',
          consultationId: consultationId,
          joinType: 'dashboard'
        }
      });

      // Setup connection monitoring
      this.setupConnectionMonitoring();

      // Setup event listeners
      this.setupConsultationEventListeners();
      this.setupMediaSoupEventListeners();
      this.setupChatEventListeners();

      // Wait for all connections to establish
      await this.waitForConnections();

      // Join consultation room - using correct events that exist in backend
      this.consultationSocket.emit('join_media_session', {
        consultationId,
        userId: practitionerId,
        userRole: 'PRACTITIONER'
      });

      // The mediasoup events are handled through the consultation gateway
      // Chat is auto-joined when connecting to the chat namespace

      // Wait for successful connection responses
      this.consultationSocket.on('media_join_response', (response) => {
        console.log(`[PractitionerConsultationRoomService] Media join response:`, response);
        if (response.success) {
          this.updateConsultationState({ isConnected: true });
        } else {
          throw new Error(`Failed to join media session: ${response.error}`);
        }
      });

      console.log(`[PractitionerConsultationRoomService] All WebSocket connections initialized successfully`);
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to initialize WebSocket connections:`, error);
      throw error;
    }
  }

  /**
   * Add notification to the notification stream
   */
  private addNotification(notification: Partial<WebSocketNotification>): void {
    const fullNotification: WebSocketNotification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type: notification.type || 'info',
      title: notification.title || 'System Notification',
      message: notification.message || '',
      timestamp: new Date(),
      duration: notification.duration || 5000,
      actions: notification.actions || []
    };

    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([...currentNotifications, fullNotification]);

    // Auto-remove notification after duration
    if (fullNotification.duration && fullNotification.duration > 0) {
      setTimeout(() => {
        this.removeNotification(fullNotification.id);
      }, fullNotification.duration);
    }
  }

  /**
   * Remove notification by ID
   */
  private removeNotification(id: string): void {
    const currentNotifications = this.notificationsSubject.value;
    const updatedNotifications = currentNotifications.filter(n => n.id !== id);
    this.notificationsSubject.next(updatedNotifications);
  }

  /**
   * Add consultation event to the events stream
   */
  private addEvent(event: Partial<ConsultationEvent>): void {
    const fullEvent: ConsultationEvent = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type: event.type || 'consultation_status_changed',
      title: event.title || 'System Event',
      description: event.description || '',
      timestamp: new Date(),
      data: event.data || {},
      severity: event.severity || 'info'
    };

    const currentEvents = this.eventsSubject.value;
    // Keep only last 50 events to prevent memory issues
    const updatedEvents = [fullEvent, ...currentEvents].slice(0, 50);
    this.eventsSubject.next(updatedEvents);
  }

  /**
   * Update connection status for different services
   */
  private updateConnectionStatus(service: 'consultation' | 'chat' | 'media', connected: boolean): void {
    const currentStatus = this.connectionStatusSubject.value;
    const updatedStatus = { ...currentStatus, [service]: connected };
    this.connectionStatusSubject.next(updatedStatus);
  }

  /**
   * Setup consultation WebSocket event listeners
   */
  private setupConsultationEventListeners(): void {
    if (!this.consultationSocket) return;

    // Patient events
    this.consultationSocket.on('patient_joined_waiting_room', (data) => {
      this.updateConsultationState({
        waitingRoomStatus: {
          hasWaitingPatients: true,
          waitingCount: data.waitingCount || 1
        }
      });

      this.addNotification({
        type: 'info',
        title: '👤 Patient Waiting',
        message: `${data.patientName || 'A patient'} has joined the waiting room`,
        actions: [{
          label: 'Admit Patient',
          action: 'admit_patient',
          data: { patientId: data.patientId },
          style: 'primary'
        }]
      });

      this.addEvent({
        type: 'participant_joined',
        title: 'Patient Joined Waiting Room',
        description: `${data.patientName || 'Patient'} is waiting to be admitted`,
        severity: 'info',
        data
      });

      this.patientJoinedSubject.next(data);
    });

    this.consultationSocket.on('patient_admitted_to_consultation', (data) => {
      const patientName = data.patient?.firstName || 'Patient';
      this.updateConsultationState({
        patientPresent: true,
        patientName,
        sessionStatus: 'active',
        participantCount: this.consultationStateSubject.value.participantCount + 1
      });

      this.addNotification({
        type: 'success',
        title: '✅ Patient Admitted',
        message: `${patientName} has been admitted to the consultation`,
        duration: 3000
      });

      this.addEvent({
        type: 'participant_joined',
        title: 'Patient Admitted',
        description: `${patientName} joined the consultation`,
        severity: 'success',
        data
      });

      this.patientAdmittedSubject.next(data);
    });

    this.consultationSocket.on('patient_admitted', (data) => {
      const patientName = data.patient?.firstName || 'Patient';
      this.updateConsultationState({
        patientPresent: true,
        patientName,
        sessionStatus: 'active',
        participantCount: this.consultationStateSubject.value.participantCount + 1
      });
      this.patientAdmittedSubject.next(data);
    });

    this.consultationSocket.on('patient_admission_confirmed', (data) => {
      console.log(`[PractitionerConsultationRoomService] Patient admission confirmed:`, data);
      // Practitioner receives confirmation that patient was successfully admitted
      this.patientAdmittedSubject.next({
        ...data,
        message: 'Patient has been successfully admitted to consultation',
        type: 'admission_confirmed'
      });
    });

    this.consultationSocket.on('consultation_status', (data) => {
      console.log(`[PractitionerConsultationRoomService] Consultation status update:`, data);
      if (data.status === 'ACTIVE') {
        this.updateConsultationState({
          sessionStatus: 'active',
          consultationStartTime: new Date()
        });
      }
    });

    this.consultationSocket.on('media_session_live', (data) => {
      console.log(`[PractitionerConsultationRoomService] Media session live:`, data);
      this.updateMediaSessionState({
        canJoinMedia: true,
        mediaInitialized: true
      });
      this.mediaSessionReadySubject.next(data);
    });

    this.consultationSocket.on('redirect_to_consultation_room', (data) => {
      console.log(`[PractitionerConsultationRoomService] Redirect to consultation room:`, data);
      // This can be used to ensure all participants are in sync
      this.updateConsultationState({
        sessionStatus: 'active'
      });
    });

    this.consultationSocket.on('transition_to_consultation_room', (data) => {
      console.log(`[PractitionerConsultationRoomService] Transition to consultation room:`, data);
      this.updateConsultationState({
        sessionStatus: 'active',
        participantCount: data.participantIds?.length || 1
      });
    });

    this.consultationSocket.on('patient_left', (data) => {
      const patientName = data.patient?.firstName || 'Patient';
      this.updateConsultationState({
        patientPresent: false,
        sessionStatus: data.consultationEnded ? 'ended' : 'waiting'
      });

      this.addNotification({
        type: 'warning',
        title: '👋 Patient Left',
        message: `${patientName} has left the consultation`,
        duration: 4000
      });

      this.addEvent({
        type: 'participant_left',
        title: 'Patient Left',
        description: `${patientName} disconnected from the consultation`,
        severity: 'warning',
        data
      });

      this.patientLeftSubject.next(data);
    });


    this.consultationSocket.on('consultation_activated', (data) => {
      console.log(`[PractitionerConsultationRoomService] Consultation activated:`, data);
      this.updateConsultationState({
        sessionStatus: 'active',
        consultationStartTime: new Date(),
        isConnected: true
      });

      this.addNotification({
        type: 'success',
        title: '🎉 Consultation Active',
        message: 'Consultation is now active and ready for participants',
        duration: 3000
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'Consultation Activated',
        description: 'Consultation session is now live',
        severity: 'success',
        data
      });
    });

    this.consultationSocket.on('consultation_activated_response', (data) => {
      if (data.success) {
        console.log(`[PractitionerConsultationRoomService] Consultation activation successful`);
        this.updateConsultationState({
          sessionStatus: 'active',
          isConnected: true
        });
      } else {
        console.error(`[PractitionerConsultationRoomService] Consultation activation failed:`, data.error);
        this.addNotification({
          type: 'error',
          title: 'Activation Failed',
          message: data.error || 'Failed to activate consultation',
          duration: 5000
        });
      }
    });

    // Consultation state events
    this.consultationSocket.on('consultation_ended', (data) => {
      this.updateConsultationState({
        sessionStatus: 'ended'
      });

      this.addNotification({
        type: 'info',
        title: '📞 Consultation Ended',
        message: 'The consultation has been completed',
        duration: null, // Permanent notification
        actions: [{
          label: 'Return to Dashboard',
          action: 'navigate_dashboard',
          style: 'primary'
        }]
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'Consultation Ended',
        description: 'The consultation session has been completed',
        severity: 'info',
        data
      });

      this.consultationEndedSubject.next(data);
    });

    this.consultationSocket.on('consultation_status_update', (data) => {
      this.updateConsultationState({
        sessionStatus: data.status?.toLowerCase() || 'active',
        participantCount: data.participantCount || 0
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'Status Updated',
        description: `Consultation status changed to ${data.status}`,
        severity: 'info',
        data
      });
    });

    // Waiting room updates
    this.consultationSocket.on('waiting_room_update', (data) => {
      this.updateConsultationState({
        waitingRoomStatus: {
          hasWaitingPatients: data.waitingCount > 0,
          waitingCount: data.waitingCount || 0
        }
      });

      if (data.waitingCount > 0) {
        this.addNotification({
          type: 'info',
          title: '🚪 Waiting Room Update',
          message: `${data.waitingCount} patient(s) waiting to be admitted`,
          actions: [{
            label: 'View Waiting Room',
            action: 'show_waiting_room',
            style: 'primary'
          }]
        });
      }

      this.addEvent({
        type: 'waiting_room_update',
        title: 'Waiting Room Update',
        description: `${data.waitingCount} patients in waiting room`,
        severity: data.waitingCount > 0 ? 'info' : 'success',
        data
      });

      this.waitingRoomUpdateSubject.next(data);
    });

    // Participant management events
    this.consultationSocket.on('participant_invitation_sent', (data) => {
      const participantName = data.name || data.inviteEmail;

      this.addNotification({
        type: 'success',
        title: '📧 Invitation Sent',
        message: `Invitation sent to ${participantName} (${data.role})`,
        duration: 3000
      });

      this.addEvent({
        type: 'participant_joined',
        title: 'Participant Invited',
        description: `Sent ${data.role} invitation to ${participantName}`,
        severity: 'success',
        data
      });
    });

    this.consultationSocket.on('participant_added', (data) => {
      const participantName = data.participant?.name || data.participant?.email;

      this.addNotification({
        type: 'info',
        title: '👥 Participant Added',
        message: `${participantName} (${data.participant?.role}) has been added to the consultation`,
        duration: 4000
      });

      this.addEvent({
        type: 'participant_joined',
        title: 'Participant Added',
        description: `${participantName} joined as ${data.participant?.role}`,
        severity: 'success',
        data
      });

      // Update participants list if needed
      const currentParticipants = this.participantsSubject.value;
      const newParticipant = {
        id: data.participant?.id || 0,
        firstName: data.participant?.name?.split(' ')[0] || '',
        lastName: data.participant?.name?.split(' ').slice(1).join(' ') || '',
        role: data.participant?.role || 'GUEST',
        isActive: false
      };
      this.participantsSubject.next([...currentParticipants, newParticipant]);
    });

    this.consultationSocket.on('magic_link_generated', (data) => {
      const participantName = data.name || data.email;

      this.addNotification({
        type: 'success',
        title: '🔗 Magic Link Generated',
        message: `Magic link created for ${participantName} (${data.role})`,
        duration: 5000,
        actions: [{
          label: 'Copy Link',
          action: 'copy_magic_link',
          data: { email: data.email },
          style: 'primary'
        }]
      });

      this.addEvent({
        type: 'participant_joined',
        title: 'Magic Link Generated',
        description: `Created magic link for ${participantName} (${data.role})`,
        severity: 'info',
        data
      });
    });

    this.consultationSocket.on('participant_joined_live', (data) => {
      const currentParticipants = this.participantsSubject.value;
      const isNewParticipant = !currentParticipants.find(p => p.id === data.userId);

      if (isNewParticipant) {
        this.addNotification({
          type: 'success',
          title: '🎉 Participant Joined',
          message: `A ${data.userRole.toLowerCase()} has joined the live consultation`,
          duration: 4000
        });

        this.addEvent({
          type: 'participant_joined',
          title: 'Live Participant Joined',
          description: `${data.userRole} joined the live consultation`,
          severity: 'success',
          data
        });

        // Update participant count
        this.updateConsultationState({
          participantCount: this.consultationStateSubject.value.participantCount + 1
        });
      }
    });

    // Handle practitioner joined events (when practitioner joins)
    this.consultationSocket.on('practitioner_joined', (data) => {
      console.log('Practitioner joined consultation:', data);

      // Update consultation state to active
      this.updateConsultationState({
        sessionStatus: 'active',
        isConnected: true,
        consultationStartTime: new Date()
      });

      // Notify about consultation becoming active
      this.addNotification({
        type: 'success',
        title: 'Consultation Active',
        message: 'Practitioner has joined and the consultation is now active',
        duration: 5000
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'Consultation Activated',
        description: 'Practitioner joined and consultation became active',
        severity: 'success',
        data
      });
    });

    // Handle session timeout warnings
    this.consultationSocket.on('practitioner_session_warning', (data) => {
      console.log('Session timeout warning:', data);
      this.addNotification({
        type: 'warning',
        title: 'Session Warning',
        message: 'Please start your media session soon to avoid timeout',
        duration: 10000
      });
    });

    // Handle session cleanup
    this.consultationSocket.on('practitioner_session_cleanup', (data) => {
      console.log('Session cleanup initiated:', data);
      this.addNotification({
        type: 'error',
        title: 'Session Timeout',
        message: 'Session timed out due to inactivity',
        duration: null // Persistent notification
      });
    });

    // Connection events
    this.consultationSocket.on('connect', () => {
      this.updateConsultationState({ isConnected: true });
      this.updateConnectionStatus('consultation', true);

      this.addNotification({
        type: 'success',
        title: '🔗 Connected',
        message: 'Consultation WebSocket connected successfully',
        duration: 2000
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'WebSocket Connected',
        description: 'Consultation service connected',
        severity: 'success'
      });
    });

    this.consultationSocket.on('disconnect', () => {
      this.updateConsultationState({ isConnected: false });
      this.updateConnectionStatus('consultation', false);

      this.addNotification({
        type: 'error',
        title: '⚠️ Connection Lost',
        message: 'Consultation WebSocket disconnected. Attempting to reconnect...',
        actions: [{
          label: 'Retry Connection',
          action: 'retry_connection',
          style: 'primary'
        }]
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'WebSocket Disconnected',
        description: 'Consultation service disconnected',
        severity: 'error'
      });
    });

    // Media state synchronization events
    this.consultationSocket.on('participant_video_toggled', (data) => {
      console.log('Participant video toggled:', data);

      const userName = data.userId ? `User ${data.userId}` : 'A participant';
      const videoStatus = data.enabled ? 'enabled' : 'disabled';

      this.addNotification({
        type: data.enabled ? 'success' : 'info',
        title: `📹 Video ${data.enabled ? 'On' : 'Off'}`,
        message: `${userName} has ${videoStatus} their video`,
        duration: 3000
      });

      this.addEvent({
        type: 'media_status_changed',
        title: `Video ${data.enabled ? 'Enabled' : 'Disabled'}`,
        description: `${userName} turned ${videoStatus} their video`,
        severity: data.enabled ? 'success' : 'info',
        data
      });
    });

    this.consultationSocket.on('participant_audio_toggled', (data) => {
      console.log('Participant audio toggled:', data);

      const userName = data.userId ? `User ${data.userId}` : 'A participant';
      const audioStatus = data.enabled ? 'unmuted' : 'muted';

      this.addNotification({
        type: data.enabled ? 'success' : 'info',
        title: `🎤 Mic ${data.enabled ? 'Unmuted' : 'Muted'}`,
        message: `${userName} has ${audioStatus} their microphone`,
        duration: 3000
      });

      this.addEvent({
        type: 'media_status_changed',
        title: `Audio ${data.enabled ? 'Unmuted' : 'Muted'}`,
        description: `${userName} ${audioStatus} their microphone`,
        severity: data.enabled ? 'success' : 'info',
        data
      });
    });

    this.consultationSocket.on('connection_quality_updated', (data) => {
      console.log('Connection quality updated:', data);

      const userName = data.userId ? `User ${data.userId}` : 'A participant';
      const qualityEmojis: Record<string, string> = {
        excellent: '🟢',
        good: '🟡',
        fair: '🟠',
        poor: '🔴'
      };
      const emoji = qualityEmojis[data.quality] || '⚪';

      // Only show notification if quality is fair or poor
      if (data.quality === 'fair' || data.quality === 'poor') {
        this.addNotification({
          type: data.quality === 'poor' ? 'warning' : 'info',
          title: `${emoji} Connection Quality`,
          message: `${userName} has ${data.quality} connection quality`,
          duration: 5000
        });
      }

      this.addEvent({
        type: 'connection_quality_changed',
        title: `Connection Quality: ${data.quality}`,
        description: `${userName} connection quality is ${data.quality}`,
        severity: data.quality === 'poor' ? 'warning' : 'info',
        data
      });
    });
  }

  /**
   * Setup MediaSoup WebSocket event listeners
   */
  private setupMediaSoupEventListeners(): void {
    if (!this.mediasoupSocket) return;

    this.mediasoupSocket.on('media_session_ready', (data) => {
      this.updateMediaSessionState({
        routerId: data.routerId,
        rtpCapabilities: data.rtpCapabilities,
        canJoinMedia: true,
        mediaInitialized: true
      });

      this.addNotification({
        type: 'success',
        title: '🎥 Media Ready',
        message: 'Video and audio session is ready to start',
        duration: 3000
      });

      this.addEvent({
        type: 'media_status_changed',
        title: 'Media Session Ready',
        description: 'Audio/video capabilities initialized successfully',
        severity: 'success',
        data
      });

      this.mediaSessionReadySubject.next(data);
    });

    this.mediasoupSocket.on('connection_quality_update', (data) => {
      const quality = data.quality || 'good';
      this.updateMediaSessionState({
        connectionQuality: quality
      });

      // Only notify for poor connection quality
      if (quality === 'poor') {
        this.addNotification({
          type: 'warning',
          title: '📶 Connection Quality',
          message: 'Poor connection quality detected. Check your internet connection.',
          duration: 5000
        });
      }

      this.addEvent({
        type: 'media_status_changed',
        title: 'Connection Quality Update',
        description: `Connection quality: ${quality}`,
        severity: quality === 'poor' ? 'warning' : 'info',
        data
      });

      this.connectionQualitySubject.next(data);
    });

    this.mediasoupSocket.on('participant_media_status', (data) => {
      // Update participant media status
      const currentParticipants = this.participantsSubject.value;
      const updatedParticipants = currentParticipants.map(p =>
        p.id === data.participantId
          ? { ...p, mediaStatus: data.mediaStatus }
          : p
      );
      this.participantsSubject.next(updatedParticipants);

      const participant = currentParticipants.find(p => p.id === data.participantId);
      if (participant) {
        this.addEvent({
          type: 'media_status_changed',
          title: 'Participant Media Status',
          description: `${participant.firstName} ${participant.lastName} ${data.mediaStatus?.videoEnabled ? 'enabled' : 'disabled'} video`,
          severity: 'info',
          data
        });
      }
    });

    // Add participant events
    this.mediasoupSocket.on('participant_added', (data) => {
      const participantName = `${data.participant?.firstName || ''} ${data.participant?.lastName || ''}`.trim();

      this.addNotification({
        type: 'info',
        title: '👥 Participant Added',
        message: `${participantName} (${data.participant?.role}) has joined the consultation`,
        duration: 4000
      });

      this.addEvent({
        type: 'participant_joined',
        title: 'Participant Added',
        description: `${participantName} joined as ${data.participant?.role}`,
        severity: 'success',
        data
      });

      // Update participants list
      const currentParticipants = this.participantsSubject.value;
      this.participantsSubject.next([...currentParticipants, data.participant]);
    });

    this.mediasoupSocket.on('connect', () => {
      this.updateConnectionStatus('media', true);

      this.addNotification({
        type: 'success',
        title: '📹 Media Connected',
        message: 'Video/audio service connected successfully',
        duration: 2000
      });

      this.addEvent({
        type: 'media_status_changed',
        title: 'Media Service Connected',
        description: 'Audio/video WebSocket connected',
        severity: 'success'
      });
    });

    this.mediasoupSocket.on('disconnect', () => {
      this.updateMediaSessionState({ connectionQuality: 'disconnected' });
      this.updateConnectionStatus('media', false);

      this.addNotification({
        type: 'warning',
        title: '📹 Media Disconnected',
        message: 'Video/audio connection lost. Media features may not work properly.',
        duration: 6000
      });

      this.addEvent({
        type: 'media_status_changed',
        title: 'Media Service Disconnected',
        description: 'Audio/video WebSocket disconnected',
        severity: 'warning'
      });
    });
  }

  /**
   * Setup chat WebSocket event listeners
   */
  private setupChatEventListeners(): void {
    if (!this.chatSocket) return;

    this.chatSocket.on('message_history', (data) => {
      const messages = data.messages?.map((msg: any) => ({
        id: msg.id,
        userId: msg.userId,
        content: msg.content,
        createdAt: msg.createdAt,
        messageType: msg.messageType || 'TEXT',
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        filePath: msg.filePath,
        userName: msg.userName || 'Unknown',
        isFromPractitioner: msg.role === 'PRACTITIONER',
        readBy: msg.readBy || []

      })) || [];

      this.chatMessagesSubject.next(messages);

      if (messages.length > 0) {
        this.addEvent({
          type: 'message_received',
          title: 'Chat History Loaded',
          description: `${messages.length} previous messages loaded`,
          severity: 'info',
          data
        });
      }
    });

    this.chatSocket.on('new_message', (data) => {
      const currentMessages = this.chatMessagesSubject.value;
      const deliveryStatus = (data.readBy && data.readBy.length > 0)
        ? (data.readBy.length >= (this.participantsSubject.value.length - 1) ? 'read' : 'sent')
        : 'sent';
      const newMessage: ChatMessage = {
        id: data.id,
        consultationId: data.consultationId ?? this.consultationId ?? 0,
        userId: data.userId ?? data.senderId ?? 0,
        senderId: data.senderId || 0,
        senderName: data.senderName || 'Unknown',
        timestamp: data.timestamp || new Date().toISOString(),
        content: data.content,
        messageType: data.messageType,
        fileName: data.fileName,
        fileSize: data.fileSize,
        filePath: data.filePath,
        userName: data.userName,
        isFromPractitioner: data.isFromPractitioner || false,
        readBy: data.readBy || [],
        createdAt: data.createdAt || new Date().toISOString(),
        deliveryStatus,
      };

      this.chatMessagesSubject.next([...currentMessages, newMessage]);

      // Only notify for messages from others, not our own
      if (!newMessage.isFromPractitioner) {
        this.addNotification({
          type: 'info',
          title: '💬 New Message',
          message: `${newMessage.userName}: ${newMessage.content.substring(0, 50)}${newMessage.content.length > 50 ? '...' : ''}`,
          duration: 4000,
          actions: [{
            label: 'View Chat',
            action: 'open_chat',
            style: 'primary'
          }]
        });

        this.addEvent({
          type: 'message_received',
          title: 'Message Received',
          description: `New message from ${newMessage.userName}`,
          severity: 'info',
          data: newMessage
        });
      }
    });

    this.chatSocket.on('connect', () => {
      this.updateConnectionStatus('chat', true);

      this.addNotification({
        type: 'success',
        title: '💬 Chat Connected',
        message: 'Chat service connected successfully',
        duration: 2000
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'Chat Service Connected',
        description: 'Chat WebSocket connected',
        severity: 'success'
      });
    });

    this.chatSocket.on('disconnect', () => {
      this.updateConnectionStatus('chat', false);

      this.addNotification({
        type: 'warning',
        title: '💬 Chat Disconnected',
        message: 'Chat connection lost. Messages may not be delivered.',
        duration: 5000
      });

      this.addEvent({
        type: 'consultation_status_changed',
        title: 'Chat Service Disconnected',
        description: 'Chat WebSocket disconnected',
        severity: 'warning'
      });
    });


    // Enhanced chat event listeners
    this.chatSocket.on('typing_indicator', (data) => {
      const currentTyping = this.typingUsersSubject.value;
      let updatedTyping: TypingUser[];

      if (data.isTyping) {
        // Add user to typing list if not already there
        if (!currentTyping.find(user => user.userId === data.userId)) {
          updatedTyping = [...currentTyping, {
            userId: data.userId,
            userName: data.userName || 'Unknown',
            isTyping: true,
            messageType: 'user', // or 'system' if appropriate
          }];
        } else {
          updatedTyping = currentTyping;
        }
      } else {
        // Remove user from typing list
        updatedTyping = currentTyping.filter(user => user.userId !== data.userId);
      }

      this.typingUsersSubject.next(updatedTyping);
    });

    this.chatSocket.on('message_read', (data) => {
      const currentMessages = this.chatMessagesSubject.value;
      const updatedMessages = currentMessages.map(message => {
        if (message.id === data.messageId) {
          return {
            ...message,
            readBy: [...(message.readBy || []), {
              userId: data.userId,
              readAt: data.readAt
            }]
          };
        }
        return message;
      });

      this.chatMessagesSubject.next(updatedMessages);
    });

    this.chatSocket.on('file_upload_progress', (data) => {
      // Handle file upload progress if needed
      if (typeof data.percent === 'number') {
        this.fileUploadProgressSubject.next(data.percent);
      }
    });

    this.chatSocket.on('file_upload_error', (data) => {
      if (typeof data.error === 'string') {
        this.fileUploadErrorSubject.next(data.error);
      }
    });
  }

  /**
   * Load initial consultation data from join response
   */
  private loadInitialConsultationData(joinResponse: any): void {
    const data = joinResponse.data || joinResponse;

    // Update consultation state
    this.updateConsultationState({
      sessionStatus: data.status?.toLowerCase() || 'active',
      consultationStartTime: new Date()
    });

    // Update media session state
    if (data.mediasoup) {
      this.updateMediaSessionState({
        routerId: data.mediasoup.routerId,
        canJoinMedia: data.mediasoup.active || false
      });
    }

    // Load participants
    if (data.participants) {
      const participants = data.participants.map((p: any) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        role: p.role,
        isActive: p.isActive,
        inWaitingRoom: p.inWaitingRoom || false,
        joinedAt: p.joinedAt
      }));
      this.participantsSubject.next(participants);

      const patient = participants.find((p: any) => p.role === 'PATIENT');
      if (patient && patient.isActive) {
        this.updateConsultationState({
          patientPresent: true,
          patientName: `${patient.firstName} ${patient.lastName}`.trim(),
          participantCount: participants.filter((p: any) => p.isActive).length
        });
      }
    }

    if (data.messages) {
      const messages = data.messages.map((msg: any) => ({
        id: msg.id,
        userId: msg.userId,
        content: msg.content,
        createdAt: msg.createdAt,
        messageType: 'user',
        userName: msg.userName || 'Unknown',
        isFromPractitioner: msg.role === 'PRACTITIONER'
      }));
      this.chatMessagesSubject.next(messages);
    }
  }

  /**
   * Setup connection monitoring for all WebSocket connections
   */
  private setupConnectionMonitoring(): void {
    const monitorConnection = (socket: Socket, name: string) => {
      socket.on('connect', () => {
        console.log(`[${name}] Connected successfully`);
        this.updateConnectionStatus(name.toLowerCase() as any, true);

        this.addNotification({
          type: 'success',
          title: `🔗 ${name} Connected`,
          message: `${name} connection established successfully`,
          duration: 2000
        });
      });

      socket.on('disconnect', (reason) => {
        console.warn(`[${name}] Disconnected:`, reason);
        this.updateConnectionStatus(name.toLowerCase() as any, false);

        if (reason !== 'io client disconnect') {
          this.addNotification({
            type: 'warning',
            title: `⚠️ ${name} Disconnected`,
            message: `${name} connection lost. Attempting to reconnect...`,
            duration: 5000
          });
        }
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log(`[${name}] Reconnected after ${attemptNumber} attempts`);
        this.updateConnectionStatus(name.toLowerCase() as any, true);

        this.addNotification({
          type: 'success',
          title: `🔄 ${name} Reconnected`,
          message: `${name} connection restored successfully`,
          duration: 3000
        });
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`[${name}] Reconnection attempt ${attemptNumber}`);
      });

      socket.on('reconnect_error', (error) => {
        console.error(`[${name}] Reconnection error:`, error);
      });

      socket.on('reconnect_failed', () => {
        console.error(`[${name}] Reconnection failed`);
        this.addNotification({
          type: 'error',
          title: `❌ ${name} Connection Failed`,
          message: `Failed to reconnect to ${name}. Please refresh the page.`,
          duration: 10000
        });
      });

      socket.on('connect_error', (error) => {
        console.error(`[${name}] Connection error:`, error);
        this.updateConnectionStatus(name.toLowerCase() as any, false);
      });
    };

    if (this.consultationSocket) {
      monitorConnection(this.consultationSocket, 'Consultation');
    }
    if (this.mediasoupSocket) {
      monitorConnection(this.mediasoupSocket, 'Media');
    }
    if (this.chatSocket) {
      monitorConnection(this.chatSocket, 'Chat');
    }
  }

  /**
   * Wait for all WebSocket connections to establish
   */
  private async waitForConnections(): Promise<void> {
    const connectPromises: Promise<void>[] = [];

    if (this.consultationSocket) {
      connectPromises.push(
        new Promise((resolve, reject) => {
          if (this.consultationSocket!.connected) {
            resolve();
          } else {
            this.consultationSocket!.once('connect', resolve);
            this.consultationSocket!.once('connect_error', reject);
            setTimeout(() => reject(new Error('Consultation connection timeout')), 10000);
          }
        })
      );
    }

    if (this.mediasoupSocket) {
      connectPromises.push(
        new Promise((resolve, reject) => {
          if (this.mediasoupSocket!.connected) {
            resolve();
          } else {
            this.mediasoupSocket!.once('connect', resolve);
            this.mediasoupSocket!.once('connect_error', reject);
            setTimeout(() => reject(new Error('Media connection timeout')), 10000);
          }
        })
      );
    }

    if (this.chatSocket) {
      connectPromises.push(
        new Promise((resolve, reject) => {
          if (this.chatSocket!.connected) {
            resolve();
          } else {
            this.chatSocket!.once('connect', resolve);
            this.chatSocket!.once('connect_error', reject);
            setTimeout(() => reject(new Error('Chat connection timeout')), 10000);
          }
        })
      );
    }

    try {
      await Promise.all(connectPromises);
      console.log('[PractitionerConsultationRoomService] All WebSocket connections established');
    } catch (error) {
      console.error('[PractitionerConsultationRoomService] Failed to establish all connections:', error);
      throw error;
    }
  }

  /**
   * Initialize media devices with enhanced WebRTC handling
   */
  private async initializeMediaDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameras = devices.filter(device => device.kind === 'videoinput');
      const microphones = devices.filter(device => device.kind === 'audioinput');
      const speakers = devices.filter(device => device.kind === 'audiooutput');

      this.updateMediaSessionState({
        devices: {
          cameras,
          microphones,
          speakers
        }
      });

      // Request initial media access for smoother connection
      await this.requestInitialMediaAccess();

      // Setup connection quality monitoring
      this.setupConnectionQualityMonitoring();

      console.log(`[PractitionerConsultationRoomService] Media devices initialized:`, {
        cameras: cameras.length,
        microphones: microphones.length,
        speakers: speakers.length
      });
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to initialize media devices:`, error);
    }
  }

  /**
   * Request initial media access for better user experience
   */
  private async requestInitialMediaAccess(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: 30 },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      // Store stream for later use
      this.localMediaStream = stream;

      // Update media status
      this.updateConsultationState({
        mediaStatus: {
          videoEnabled: true,
          audioEnabled: true,
          screenShareEnabled: false
        }
      });

      this.addNotification({
        type: 'success',
        title: '🎥 Media Access Granted',
        message: 'Camera and microphone are ready for video calls',
        duration: 3000
      });

      // Emit media ready event to backend
      if (this.mediasoupSocket) {
        this.mediasoupSocket.emit('media_ready', {
          consultationId: this.consultationId,
          hasVideo: true,
          hasAudio: true
        });
      }

    } catch (error) {
      console.error('Failed to get initial media access:', error);
      this.addNotification({
        type: 'warning',
        title: '⚠️ Media Access Required',
        message: 'Please allow camera and microphone access for video calls',
        duration: 5000,
        actions: [{
          label: 'Grant Access',
          action: 'retry_media',
          style: 'primary'
        }]
      });
    }
  }

  /**
   * Setup connection quality monitoring for optimal performance
   */
  private setupConnectionQualityMonitoring(): void {
    if (!('connection' in navigator)) return;

    const connection = (navigator as any).connection;
    if (connection) {
      // Monitor network connection changes
      connection.addEventListener('change', () => {
        this.handleNetworkChange(connection);
      });

      // Initial connection assessment
      this.handleNetworkChange(connection);
    }

    // Setup periodic connection quality checks
    setInterval(() => {
      this.checkConnectionQuality();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Handle network connection changes
   */
  private handleNetworkChange(connection: any): void {
    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink || 0;
    let quality: 'good' | 'fair' | 'poor' | 'disconnected' = 'good';

    // Assess quality based on effective type and downlink speed
    if (effectiveType === 'slow-2g' || downlink < 0.5) {
      quality = 'poor';
    } else if (effectiveType === '2g' || downlink < 1.5) {
      quality = 'poor';
    } else if (effectiveType === '3g' || downlink < 5) {
      quality = 'fair';
    } else {
      quality = 'good';
    }

    this.updateMediaSessionState({ connectionQuality: quality });

    // Emit quality update to backend
    if (this.mediasoupSocket) {
      this.mediasoupSocket.emit('connection_quality', {
        consultationId: this.consultationId,
        quality,
        downlink,
        effectiveType
      });
    }

    if (quality === 'poor') {
      this.addNotification({
        type: 'warning',
        title: '📶 Poor Connection',
        message: 'Network connection is poor. Video quality may be affected.',
        duration: 5000
      });
    }
  }

  /**
   * Check connection quality periodically
   */
  private async checkConnectionQuality(): Promise<void> {
    try {
      const startTime = Date.now();

      // Ping the backend to check latency - using health endpoint (no /api prefix needed)
      await this.http.get(`${environment.baseUrl}/health`).toPromise();

      const latency = Date.now() - startTime;
      let quality: 'good' | 'fair' | 'poor' | 'disconnected' = 'good';

      if (latency > 1000) {
        quality = 'poor';
      } else if (latency > 500) {
        quality = 'fair';
      }

      const currentState = this.mediaSessionStateSubject.value;
      if (currentState.connectionQuality !== quality) {
        this.updateMediaSessionState({ connectionQuality: quality });

        // Emit latency info to backend
        if (this.mediasoupSocket) {
          this.mediasoupSocket.emit('latency_update', {
            consultationId: this.consultationId,
            latency,
            quality
          });
        }
      }

    } catch (error) {
      this.updateMediaSessionState({ connectionQuality: 'disconnected' });
      console.warn('Connection quality check failed:', error);
    }
  }

  /**
   * Admit patient from waiting room to consultation
   */
  async admitPatient(consultationId: number, patientId?: number): Promise<void> {
    try {
      if (!this.consultationSocket) {
        throw new Error('Consultation socket not connected');
      }

      this.consultationSocket.emit('admit_patient', {
        consultationId,
        patientId
      });

      const response = await this.http.post(`${API_ENDPOINTS.CONSULTATION}/admit`, {
        consultationId,
        patientId
      }).toPromise();

      console.log(`[PractitionerConsultationRoomService] Patient admission request sent`, response);

    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to admit patient:`, error);
      throw error;
    }
  }

  /**
   * Send chat message
   */
  async sendMessage(content: string, practitionerId: number): Promise<void> {
    try {
      if (!this.chatSocket) {
        throw new Error('Chat socket not connected');
      }

      const consultationId = this.consultationStateSubject.value.consultationId;

      this.chatSocket.emit('send_message', {
        consultationId,
        userId: practitionerId,
        content,
        role: 'PRACTITIONER'
      });

      console.log(`[PractitionerConsultationRoomService] Message sent:`, content);
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Send file message
   */
  async sendFileMessage(file: File, practitionerId: number): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('consultationId', this.consultationStateSubject.value.consultationId.toString());
      formData.append('userId', practitionerId.toString());
      formData.append('role', 'PRACTITIONER');

      // Use XMLHttpRequest for progress events
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${environment.apiUrl}/chat/upload`, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          // Emit progress event for UI
          this.chatSocket?.emit('file_upload_progress', { percent });
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          console.log(`[PractitionerConsultationRoomService] File sent:`, xhr.responseText);
        } else {
          // Emit error event for UI
          this.chatSocket?.emit('file_upload_error', { error: xhr.statusText });
        }
      };

      xhr.onerror = () => {
        this.chatSocket?.emit('file_upload_error', { error: 'Network error' });
      };

      xhr.send(formData);
    } catch (error) {
      let errorMsg = 'Unknown error';
      if (typeof error === 'string') errorMsg = error;
      else if (error instanceof Error) errorMsg = error.message;
      this.chatSocket?.emit('file_upload_error', { error: errorMsg });
      console.error(`[PractitionerConsultationRoomService] Failed to send file:`, error);
      throw error;
    }
  }

  /**
   * Start typing indicator
   */
  startTypingIndicator(practitionerId: number, practitionerName: string): void {
    if (!this.chatSocket) return;

    const consultationId = this.consultationStateSubject.value.consultationId;
    this.chatSocket.emit('typing', {
      consultationId,
      userId: practitionerId,
      userName: practitionerName,
      isTyping: true
    });
  }

  /**
   * Stop typing indicator
   */
  stopTypingIndicator(practitionerId: number, practitionerName: string): void {
    if (!this.chatSocket) return;

    const consultationId = this.consultationStateSubject.value.consultationId;
    this.chatSocket.emit('typing', {
      consultationId,
      userId: practitionerId,
      userName: practitionerName,
      isTyping: false
    });
  }

  /**
   * Mark message as read
   */
  markMessageAsRead(messageId: number, practitionerId: number): void {
    if (!this.chatSocket) return;

    const consultationId = this.consultationStateSubject.value.consultationId;
    this.chatSocket.emit('read_message', {
      consultationId,
      messageId,
      userId: practitionerId
    });
  }

  /**
   * Mark all messages as read
   */
  markAllMessagesAsRead(practitionerId: number): void {
    const messages = this.chatMessagesSubject.value;
    messages.forEach(message => {
      if (!message.readBy?.find(r => r.userId === practitionerId)) {
        this.markMessageAsRead(message.id, practitionerId);
      }
    });
    this.unreadCountSubject.next(0);
  }

  /**
   * Toggle chat visibility
   */
  toggleChatVisibility(): void {
    const currentState = this.showChatSubject.value;
    this.showChatSubject.next(!currentState);
  }

  /**
   * Update unread count
   */
  updateUnreadCount(count: number): void {
    this.unreadCountSubject.next(count);
  }

  /**
   * Activate consultation (move from WAITING to ACTIVE)
   */
  async activateConsultation(consultationId: number, practitionerId: number): Promise<void> {
    try {
      if (!this.consultationSocket) {
        throw new Error('Consultation socket not connected');
      }

      this.consultationSocket.emit('activate_consultation', {
        consultationId,
        practitionerId
      });

      console.log(`[PractitionerConsultationRoomService] Consultation activation requested: ${consultationId}`);
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to activate consultation:`, error);
      throw error;
    }
  }

  /**

   * Toggle media (video/audio)
   */
  async toggleMedia(mediaType: 'video' | 'audio', enabled: boolean): Promise<void> {
    try {
      if (!this.mediasoupSocket) {
        throw new Error('MediaSoup socket not connected');
      }

      const consultationId = this.consultationStateSubject.value.consultationId;

      this.mediasoupSocket.emit('toggle_media', {
        consultationId,
        mediaType,
        enabled
      });

      // Update local state
      const currentState = this.consultationStateSubject.value;
      this.updateConsultationState({
        mediaStatus: {
          ...currentState.mediaStatus,
          [mediaType === 'video' ? 'videoEnabled' : 'audioEnabled']: enabled
        }
      });

      console.log(`[PractitionerConsultationRoomService] ${mediaType} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to toggle ${mediaType}:`, error);
      throw error;
    }
  }

  /**
   * End consultation
   */
  async endConsultation(consultationId: number, reason?: string, notes?: string): Promise<void> {
    try {
      await this.http.post(`${API_ENDPOINTS.CONSULTATION}/end`, {
        consultationId,
        reason,
        notes
      }).toPromise();

      // Disconnect and reset
      await this.leaveConsultation();

      console.log(`[PractitionerConsultationRoomService] Consultation ended`);
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to end consultation:`, error);
      throw error;
    }
  }

  /**
   * Leave consultation and cleanup
   */
  async leaveConsultation(): Promise<void> {
    try {
      // Cleanup media resources first
      this.cleanupMediaResources();

      // Disconnect WebSocket connections
      if (this.consultationSocket) {
        this.consultationSocket.disconnect();
        this.consultationSocket = null;
      }

      if (this.mediasoupSocket) {
        this.mediasoupSocket.disconnect();
        this.mediasoupSocket = null;
      }

      if (this.chatSocket) {
        this.chatSocket.disconnect();
        this.chatSocket = null;
      }

      // Reset state
      this.resetState();

      console.log(`[PractitionerConsultationRoomService] Left consultation and cleaned up`);
    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to leave consultation:`, error);
      throw error;
    }
  }

  /**
   * Update consultation state
   */
  private updateConsultationState(updates: Partial<PractitionerConsultationState>): void {
    const currentState = this.consultationStateSubject.value;
    this.consultationStateSubject.next({ ...currentState, ...updates });
  }

  /**
   * Update media session state
   */
  private updateMediaSessionState(updates: Partial<PractitionerMediaSessionState>): void {
    const currentState = this.mediaSessionStateSubject.value;
    this.mediaSessionStateSubject.next({ ...currentState, ...updates });
  }

  /**
   * Reset all state to initial values
   */
  private resetState(): void {
    this.consultationStateSubject.next({
      consultationId: 0,
      isConnected: false,
      patientPresent: false,
      patientName: '',
      patientLanguage: null,
      sessionStatus: 'connecting',
      participantCount: 0,
      consultationStartTime: null,
      mediaStatus: {
        videoEnabled: false,
        audioEnabled: false,
        screenShareEnabled: false
      },
      waitingRoomStatus: {
        hasWaitingPatients: false,
        waitingCount: 0
      }
    });

    this.mediaSessionStateSubject.next({
      routerId: '',
      rtpCapabilities: null,
      canJoinMedia: false,
      mediaInitialized: false,
      connectionQuality: 'disconnected',
      devices: {
        cameras: [],
        microphones: [],
        speakers: []
      }
    });

    this.chatMessagesSubject.next([]);
    this.participantsSubject.next([]);
  }

  // ================================
  // Enhanced WebRTC Media Control Methods
  // ================================

  /**
   * Enable/disable video with smooth transitions
   */
  async toggleVideo(enable: boolean): Promise<void> {
    try {
      if (!this.localMediaStream) {
        await this.requestInitialMediaAccess();
      }

      if (this.localMediaStream) {
        const videoTracks = this.localMediaStream.getVideoTracks();
        videoTracks.forEach(track => {
          track.enabled = enable;
        });

        // Update state
        const currentState = this.consultationStateSubject.value;
        this.updateConsultationState({
          mediaStatus: {
            ...currentState.mediaStatus,
            videoEnabled: enable
          }
        });

        // Notify backend and other participants
        if (this.mediasoupSocket) {
          this.mediasoupSocket.emit('media_toggle', {
            consultationId: this.consultationId,
            type: 'video',
            enabled: enable
          });
        }

        this.addNotification({
          type: 'info',
          title: enable ? '📹 Video Enabled' : '📹 Video Disabled',
          message: `Video is now ${enable ? 'on' : 'off'}`,
          duration: 2000
        });
      }
    } catch (error) {
      console.error('Failed to toggle video:', error);
      this.addNotification({
        type: 'error',
        title: '❌ Video Error',
        message: 'Failed to toggle video. Please check your camera permissions.',
        duration: 5000
      });
    }
  }

  /**
   * Enable/disable audio with echo cancellation
   */
  async toggleAudio(enable: boolean): Promise<void> {
    try {
      if (!this.localMediaStream) {
        await this.requestInitialMediaAccess();
      }

      if (this.localMediaStream) {
        const audioTracks = this.localMediaStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = enable;
        });

        // Update state
        const currentState = this.consultationStateSubject.value;
        this.updateConsultationState({
          mediaStatus: {
            ...currentState.mediaStatus,
            audioEnabled: enable
          }
        });

        // Notify backend and other participants
        if (this.mediasoupSocket) {
          this.mediasoupSocket.emit('media_toggle', {
            consultationId: this.consultationId,
            type: 'audio',
            enabled: enable
          });
        }

        this.addNotification({
          type: 'info',
          title: enable ? '🎤 Microphone Enabled' : '🎤 Microphone Disabled',
          message: `Microphone is now ${enable ? 'on' : 'off'}`,
          duration: 2000
        });
      }
    } catch (error) {
      console.error('Failed to toggle audio:', error);
      this.addNotification({
        type: 'error',
        title: '❌ Audio Error',
        message: 'Failed to toggle microphone. Please check your microphone permissions.',
        duration: 5000
      });
    }
  }

  /**
   * Start screen sharing with optimized settings
   */
  async startScreenShare(): Promise<void> {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 15, max: 30 }
        },
        audio: true
      });

      // Replace video track with screen share
      if (this.localMediaStream) {
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = this.rtcPeerConnections.forEach(async (pc, participantId) => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
          }
        });
      }

      // Update state
      const currentState = this.consultationStateSubject.value;
      this.updateConsultationState({
        mediaStatus: {
          ...currentState.mediaStatus,
          screenShareEnabled: true
        }
      });

      // Notify backend
      if (this.mediasoupSocket) {
        this.mediasoupSocket.emit('screen_share_start', {
          consultationId: this.consultationId
        });
      }

      this.addNotification({
        type: 'success',
        title: '🖥️ Screen Sharing Started',
        message: 'Your screen is now being shared with participants',
        duration: 3000
      });

      // Handle screen share end
      screenStream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

    } catch (error) {
      console.error('Failed to start screen sharing:', error);
      this.addNotification({
        type: 'error',
        title: '❌ Screen Share Error',
        message: 'Failed to start screen sharing. Please try again.',
        duration: 5000
      });
    }
  }

  /**
   * Stop screen sharing and restore camera
   */
  async stopScreenShare(): Promise<void> {
    try {
      // Restore camera video
      if (this.localMediaStream) {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, frameRate: 30 },
          audio: false
        });

        const videoTrack = cameraStream.getVideoTracks()[0];

        // Replace screen share with camera
        this.rtcPeerConnections.forEach(async (pc, participantId) => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
          }
        });

        // Update local stream
        const existingVideoTrack = this.localMediaStream.getVideoTracks()[0];
        if (existingVideoTrack) {
          this.localMediaStream.removeTrack(existingVideoTrack);
          existingVideoTrack.stop();
        }
        this.localMediaStream.addTrack(videoTrack);
      }

      // Update state
      const currentState = this.consultationStateSubject.value;
      this.updateConsultationState({
        mediaStatus: {
          ...currentState.mediaStatus,
          screenShareEnabled: false
        }
      });

      // Notify backend
      if (this.mediasoupSocket) {
        this.mediasoupSocket.emit('screen_share_stop', {
          consultationId: this.consultationId
        });
      }

      this.addNotification({
        type: 'info',
        title: '🖥️ Screen Sharing Stopped',
        message: 'Screen sharing has ended. Camera is now active.',
        duration: 3000
      });

    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
    }
  }

  /**
   * Change camera device
   */
  async switchCamera(deviceId: string): Promise<void> {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
        audio: false
      });

      if (this.localMediaStream) {
        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = this.localMediaStream.getVideoTracks()[0];

        // Replace track in peer connections
        this.rtcPeerConnections.forEach(async (pc, participantId) => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
          }
        });

        // Update local stream
        if (oldVideoTrack) {
          this.localMediaStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        this.localMediaStream.addTrack(newVideoTrack);
      }

      this.addNotification({
        type: 'success',
        title: '📹 Camera Switched',
        message: 'Camera device changed successfully',
        duration: 2000
      });

    } catch (error) {
      console.error('Failed to switch camera:', error);
      this.addNotification({
        type: 'error',
        title: '❌ Camera Switch Error',
        message: 'Failed to switch camera device',
        duration: 5000
      });
    }
  }

  /**
   * Change microphone device
   */
  async switchMicrophone(deviceId: string): Promise<void> {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (this.localMediaStream) {
        const newAudioTrack = newStream.getAudioTracks()[0];
        const oldAudioTrack = this.localMediaStream.getAudioTracks()[0];

        // Replace track in peer connections
        this.rtcPeerConnections.forEach(async (pc, participantId) => {
          const senders = pc.getSenders();
          const audioSender = senders.find(s => s.track?.kind === 'audio');
          if (audioSender) {
            await audioSender.replaceTrack(newAudioTrack);
          }
        });

        // Update local stream
        if (oldAudioTrack) {
          this.localMediaStream.removeTrack(oldAudioTrack);
          oldAudioTrack.stop();
        }
        this.localMediaStream.addTrack(newAudioTrack);
      }

      this.addNotification({
        type: 'success',
        title: '🎤 Microphone Switched',
        message: 'Microphone device changed successfully',
        duration: 2000
      });

    } catch (error) {
      console.error('Failed to switch microphone:', error);
      this.addNotification({
        type: 'error',
        title: '❌ Microphone Switch Error',
        message: 'Failed to switch microphone device',
        duration: 5000
      });
    }
  }

  /**
   * Get current media stream
   */
  getLocalMediaStream(): MediaStream | null {
    return this.localMediaStream;
  }

  /**
   * Get remote stream for a participant
   */
  getRemoteStream(participantId: string): MediaStream | null {
    return this.remoteStreams.get(participantId) || null;
  }

  /**
   * Cleanup media resources
   */
  private cleanupMediaResources(): void {
    // Stop local media stream
    if (this.localMediaStream) {
      this.localMediaStream.getTracks().forEach(track => track.stop());
      this.localMediaStream = null;
    }

    // Close peer connections
    this.rtcPeerConnections.forEach((pc, participantId) => {
      pc.close();
    });
    this.rtcPeerConnections.clear();

    // Clear remote streams
    this.remoteStreams.clear();
  }

  /**
   * Get current consultation state
   */
  getCurrentState(): PractitionerConsultationState {
    return this.consultationStateSubject.value;
  }

  /**
   * Get current media session state
   */
  getCurrentMediaState(): PractitionerMediaSessionState {
    return this.mediaSessionStateSubject.value;
  }

  /**
   * Clear notification by ID (public method for components)
   */
  clearNotification(id: string): void {
    this.removeNotification(id);
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications(): void {
    this.notificationsSubject.next([]);
  }

  /**
   * Handle notification action (public method for components)
   */
  handleNotificationAction(action: string, data?: any): void {
    switch (action) {
      case 'admit_patient':
        if (data?.patientId) {
          this.admitPatientFromWaitingRoom(this.getCurrentState().consultationId, data.patientId);
        }
        break;
      case 'retry_connection':
        this.reinitializeConnections();
        break;
      case 'navigate_dashboard':
        break;
      case 'show_waiting_room':
        break;
      case 'open_chat':
        break;
    }
  }

  /**
   * Reinitialize connections
   */
  private async reinitializeConnections(): Promise<void> {
    const state = this.getCurrentState();
    if (state.consultationId > 0) {
      try {
        // Attempt to reconnect
        await this.initializePractitionerConsultationRoom(state.consultationId, 1); // TODO: Get practitionerId properly
      } catch (error) {
        this.addNotification({
          type: 'error',
          title: 'Reconnection Failed',
          message: 'Failed to reconnect. Please refresh the page.',
        });
      }
    }
  }

  /**
   * Add participant (expert or guest) to consultation
   */
  async addParticipant(consultationId: number, participantData: {
    role: 'EXPERT' | 'GUEST' | 'PATIENT';
    email: string;
    name: string;
    notes?: string;
  }): Promise<void> {
    try {
      console.log(`[PractitionerConsultationRoomService] Adding participant to consultation ${consultationId}:`, participantData);

      const response = await this.http.post(
        `${API_ENDPOINTS.CONSULTATION}/${consultationId}/participants`,
        {
          email: participantData.email,
          role: participantData.role,
          name: participantData.name,
          notes: participantData.notes
        }
      ).toPromise();

      console.log(`[PractitionerConsultationRoomService] Participant added successfully:`, response);

      // The real-time update will come through WebSocket 'participant_added' event
      // which is already handled in setupConsultationEventListeners()

    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to add participant:`, error);
      throw error;
    }
  }

  /**
   * Remove participant from consultation
   */
  async removeParticipant(consultationId: number, participantId: number): Promise<void> {
    try {
      console.log(`[PractitionerConsultationRoomService] Removing participant ${participantId} from consultation ${consultationId}`);

      await this.http.delete(
        `${API_ENDPOINTS.CONSULTATION}/${consultationId}/participants/${participantId}`
      ).toPromise();

      const currentParticipants = this.participantsSubject.value;
      const updatedParticipants = currentParticipants.filter(p => p.id !== participantId);
      this.participantsSubject.next(updatedParticipants);

      console.log(`[PractitionerConsultationRoomService] Participant removed successfully`);

    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to remove participant:`, error);
      throw error;
    }
  }

  /**
   * Get consultation participants from backend
   */
  async loadConsultationParticipants(consultationId: number): Promise<ConsultationParticipant[]> {
    try {
      console.log(`[PractitionerConsultationRoomService] Loading participants for consultation ${consultationId}`);

      const participants = await this.http.get<ConsultationParticipant[]>(
        `${API_ENDPOINTS.CONSULTATION}/${consultationId}/participants`
      ).toPromise();

      this.participantsSubject.next(participants || []);

      return participants || [];

    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to load participants:`, error);
      return [];
    }
  }

  /**
   * Admit patient from waiting room
   */
  async admitPatientFromWaitingRoom(consultationId: number, patientId?: number): Promise<void> {
    try {
      console.log(`[PractitionerConsultationRoomService] Admitting patient to consultation ${consultationId}`);

      if (this.consultationSocket) {
        this.consultationSocket.emit('admit_patient', {
          consultationId,
          patientId
        });

        console.log(`[PractitionerConsultationRoomService] Patient admission request sent`);
      } else {
        throw new Error('Consultation socket not connected');
      }

    } catch (error) {
      console.error(`[PractitionerConsultationRoomService] Failed to admit patient:`, error);
      throw error;
    }
  }
}

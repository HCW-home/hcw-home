import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from 'src/environments/environment';

export interface ConsultationRoomState {
 consultationId: number;
 isConnected: boolean;
 practitionerPresent: boolean;
 practitionerName: string;
 sessionStatus: 'connecting' | 'active' | 'ended' | 'error';
 participantCount: number;
 mediaStatus: {
  videoEnabled: boolean;
  audioEnabled: boolean;
  screenShareEnabled: boolean;
 };
}

export interface MediaSessionState {
 routerId: string;
 rtpCapabilities: any;
 canJoinMedia: boolean;
 mediaInitialized: boolean;
 connectionQuality: 'good' | 'fair' | 'poor' | 'disconnected';
}

export interface ChatMessage {
 id: number;
 userId: number;
 content: string;
 createdAt: string;
 messageType: 'user' | 'system';
 userName?: string;
}

export interface ConsultationParticipant {
 id: number;
 firstName: string;
 lastName: string;
 role: string;
 isActive: boolean;
 mediaStatus?: {
  videoEnabled: boolean;
  audioEnabled: boolean;
 };
}

@Injectable({
 providedIn: 'root'
})
export class ConsultationRoomService {
 private consultationSocket: Socket | null = null;
 private mediasoupSocket: Socket | null = null;
 private chatSocket: Socket | null = null;

 // State management with BehaviorSubjects
 private consultationStateSubject = new BehaviorSubject<ConsultationRoomState>({
  consultationId: 0,
  isConnected: false,
  practitionerPresent: false,
  practitionerName: '',
  sessionStatus: 'connecting',
  participantCount: 0,
  mediaStatus: {
   videoEnabled: false,
   audioEnabled: false,
   screenShareEnabled: false
  }
 });

 private mediaSessionStateSubject = new BehaviorSubject<MediaSessionState>({
  routerId: '',
  rtpCapabilities: null,
  canJoinMedia: false,
  mediaInitialized: false,
  connectionQuality: 'disconnected'
 });

 private chatMessagesSubject = new BehaviorSubject<ChatMessage[]>([]);
 private participantsSubject = new BehaviorSubject<ConsultationParticipant[]>([]);

 // Event subjects for real-time notifications
 private practitionerJoinedSubject = new Subject<any>();
 private practitionerLeftSubject = new Subject<any>();
 private mediaSessionReadySubject = new Subject<any>();
 private connectionQualitySubject = new Subject<any>();
 private consultationEndedSubject = new Subject<any>();

 constructor(private http: HttpClient) { }

 // Public observables for components to subscribe
 get consultationState$(): Observable<ConsultationRoomState> {
  return this.consultationStateSubject.asObservable();
 }

 get mediaSessionState$(): Observable<MediaSessionState> {
  return this.mediaSessionStateSubject.asObservable();
 }

 get chatMessages$(): Observable<ChatMessage[]> {
  return this.chatMessagesSubject.asObservable();
 }

 get participants$(): Observable<ConsultationParticipant[]> {
  return this.participantsSubject.asObservable();
 }

 get practitionerJoined$(): Observable<any> {
  return this.practitionerJoinedSubject.asObservable();
 }

 get practitionerLeft$(): Observable<any> {
  return this.practitionerLeftSubject.asObservable();
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

 /**
  * Initialize consultation room with full backend integration
  */
 async initializeConsultationRoom(
  consultationId: number,
  patientId: number,
  options: {
   autoConnectMedia?: boolean;
   enableChat?: boolean;
   requestTimeout?: number;
  } = {}
 ): Promise<void> {
  const { autoConnectMedia = true, enableChat = true, requestTimeout = 30000 } = options;

  try {
   console.log(`[ConsultationRoomService] Initializing consultation room ${consultationId} for patient ${patientId}`);

   // Update initial state
   this.updateConsultationState({
    consultationId,
    sessionStatus: 'connecting'
   });

   await Promise.all([
    this.connectToConsultationGateway(consultationId, patientId),
    autoConnectMedia ? this.connectToMediasoupGateway(consultationId, patientId) : Promise.resolve(),
    enableChat ? this.connectToChatGateway(consultationId, patientId) : Promise.resolve()
   ]);

   await this.fetchInitialConsultationState(consultationId);

   // Join media session if auto-connect is enabled
   if (autoConnectMedia) {
    await this.joinMediaSession(consultationId, patientId);
   }

   this.updateConsultationState({
    isConnected: true,
    sessionStatus: 'active'
   });

   console.log(`[ConsultationRoomService] Successfully initialized consultation room ${consultationId}`);

  } catch (error) {
   console.error(`[ConsultationRoomService] Failed to initialize consultation room:`, error);
   this.updateConsultationState({
    sessionStatus: 'error'
   });
   throw error;
  }
 }

 /**
  * Connect to consultation WebSocket gateway
  */
 private async connectToConsultationGateway(consultationId: number, patientId: number): Promise<void> {
  return new Promise((resolve, reject) => {
   this.consultationSocket = io(`${environment.socketUrl}/consultation`, {
    query: {
     consultationId: consultationId.toString(),
     userId: patientId.toString(),
     userRole: 'PATIENT'
    },
    transports: ['websocket'],
    timeout: 10000
   });

   this.consultationSocket.on('connect', () => {
    console.log(`[ConsultationRoomService] Connected to consultation gateway`);
    this.setupConsultationEventListeners();
    resolve();
   });

   this.consultationSocket.on('connect_error', (error) => {
    console.error(`[ConsultationRoomService] Consultation gateway connection error:`, error);
    reject(error);
   });

   this.consultationSocket.on('disconnect', (reason) => {
    console.log(`[ConsultationRoomService] Consultation gateway disconnected:`, reason);
    this.updateConsultationState({ isConnected: false });
   });
  });
 }

 /**
  * Setup consultation WebSocket event listeners
  */
 private setupConsultationEventListeners(): void {
  if (!this.consultationSocket) return;

  // Practitioner events
  this.consultationSocket.on('practitioner_joined', (data) => {
   console.log(`[ConsultationRoomService] Practitioner joined:`, data);
   this.updateConsultationState({
    practitionerPresent: true,
    practitionerName: data.practitioner?.name || 'Doctor'
   });
   this.practitionerJoinedSubject.next(data);
  });

  this.consultationSocket.on('practitioner_left', (data) => {
   console.log(`[ConsultationRoomService] Practitioner left:`, data);
   this.updateConsultationState({
    practitionerPresent: false
   });
   this.practitionerLeftSubject.next(data);
  });

  // Consultation state events
  this.consultationSocket.on('consultation_ended', (data) => {
   console.log(`[ConsultationRoomService] Consultation ended:`, data);
   this.updateConsultationState({
    sessionStatus: 'ended'
   });
   this.consultationEndedSubject.next(data);
  });

  // Patient admission events
  this.consultationSocket.on('patient_admitted', (data) => {
   console.log(`[ConsultationRoomService] Patient admitted to consultation room:`, data);
   // Patient is now in consultation room, not waiting room
  });

  // Navigation events
  this.consultationSocket.on('navigate_to_consultation_room', (data) => {
   console.log(`[ConsultationRoomService] Navigate to consultation room:`, data);
   // Handle automatic navigation if needed
  });

  // Session status updates
  this.consultationSocket.on('session_status_response', (data) => {
   console.log(`[ConsultationRoomService] Session status update:`, data);
   this.updateConsultationStateFromBackend(data);
  });
 }

 /**
  * Connect to MediaSoup WebSocket gateway
  */
 private async connectToMediasoupGateway(consultationId: number, patientId: number): Promise<void> {
  return new Promise((resolve, reject) => {
   this.mediasoupSocket = io(`${environment.socketUrl}/mediasoup`, {
    query: {
     consultationId: consultationId.toString(),
     userId: patientId.toString()
    },
    transports: ['websocket'],
    timeout: 10000
   });

   this.mediasoupSocket.on('connect', () => {
    console.log(`[ConsultationRoomService] Connected to MediaSoup gateway`);
    this.setupMediasoupEventListeners();
    resolve();
   });

   this.mediasoupSocket.on('connect_error', (error) => {
    console.error(`[ConsultationRoomService] MediaSoup gateway connection error:`, error);
    reject(error);
   });

   this.mediasoupSocket.on('disconnect', (reason) => {
    console.log(`[ConsultationRoomService] MediaSoup gateway disconnected:`, reason);
    this.updateMediaSessionState({ connectionQuality: 'disconnected' });
   });
  });
 }

 /**
  * Setup MediaSoup WebSocket event listeners
  */
 private setupMediasoupEventListeners(): void {
  if (!this.mediasoupSocket) return;

  // Media session ready
  this.mediasoupSocket.on('media_session_ready', (data) => {
   console.log(`[ConsultationRoomService] Media session ready:`, data);
   this.updateMediaSessionState({
    routerId: data.routerId,
    rtpCapabilities: data.rtpCapabilities,
    mediaInitialized: true
   });
   this.mediaSessionReadySubject.next(data);
  });

  // Media join response
  this.mediasoupSocket.on('media_join_response', (data) => {
   console.log(`[ConsultationRoomService] Media join response:`, data);
   if (data.success) {
    this.updateMediaSessionState({
     canJoinMedia: data.canJoinMedia,
     mediaInitialized: true
    });
   }
  });

  // Connection quality updates
  this.mediasoupSocket.on('connection_quality_update', (data) => {
   console.log(`[ConsultationRoomService] Connection quality update:`, data);
   this.connectionQualitySubject.next(data);
  });

  // Media permission status
  this.mediasoupSocket.on('media_permission_status_update', (data) => {
   console.log(`[ConsultationRoomService] Media permission status:`, data);
   // Update media status based on permissions
  });
 }

 /**
  * Connect to Chat WebSocket gateway
  */
 private async connectToChatGateway(consultationId: number, patientId: number): Promise<void> {
  return new Promise((resolve, reject) => {
   this.chatSocket = io(`${environment.socketUrl}/chat`, {
    query: {
     consultationId: consultationId.toString(),
     userId: patientId.toString(),
     userRole: 'PATIENT',
     joinType: 'consultation-room'
    },
    transports: ['websocket'],
    timeout: 10000
   });

   this.chatSocket.on('connect', () => {
    console.log(`[ConsultationRoomService] Connected to chat gateway`);
    this.setupChatEventListeners();
    resolve();
   });

   this.chatSocket.on('connect_error', (error) => {
    console.error(`[ConsultationRoomService] Chat gateway connection error:`, error);
    reject(error);
   });
  });
 }

 /**
  * Setup Chat WebSocket event listeners
  */
 private setupChatEventListeners(): void {
  if (!this.chatSocket) return;

  // New message received
  this.chatSocket.on('new_message', (data) => {
   console.log(`[ConsultationRoomService] New message received:`, data);
   this.addChatMessage(data.message);
  });

  // Message history
  this.chatSocket.on('message_history', (data) => {
   console.log(`[ConsultationRoomService] Message history received:`, data);
   this.chatMessagesSubject.next(data.messages || []);
  });

  // System messages
  this.chatSocket.on('system_message', (data) => {
   console.log(`[ConsultationRoomService] System message:`, data);
   this.addChatMessage({
    id: Date.now(),
    userId: 0,
    content: data.content,
    createdAt: data.timestamp,
    messageType: 'system'
   });
  });

  // Typing indicators
  this.chatSocket.on('user_typing', (data) => {
   console.log(`[ConsultationRoomService] User typing:`, data);
   // Handle typing indicator UI
  });

  this.chatSocket.on('user_stopped_typing', (data) => {
   console.log(`[ConsultationRoomService] User stopped typing:`, data);
   // Handle typing indicator UI
  });
 }

 /**
  * Join media session
  */
 async joinMediaSession(consultationId: number, patientId: number): Promise<void> {
  if (!this.consultationSocket) {
   throw new Error('Consultation socket not connected');
  }

  console.log(`[ConsultationRoomService] Joining media session for consultation ${consultationId}`);

  return new Promise((resolve, reject) => {
   const timeout = setTimeout(() => {
    reject(new Error('Media session join timeout'));
   }, 15000);

   this.consultationSocket!.emit('join_media_session', {
    consultationId,
    userId: patientId,
    userRole: 'PATIENT'
   });

   this.consultationSocket!.once('media_join_response', (response) => {
    clearTimeout(timeout);
    if (response.success) {
     console.log(`[ConsultationRoomService] Successfully joined media session`);
     resolve();
    } else {
     reject(new Error(response.error || 'Failed to join media session'));
    }
   });
  });
 }

 /**
  * Send chat message
  */
 async sendChatMessage(consultationId: number, patientId: number, content: string): Promise<void> {
  if (!this.chatSocket) {
   throw new Error('Chat socket not connected');
  }

  this.chatSocket.emit('send_message', {
   consultationId,
   userId: patientId,
   content,
   messageType: 'text'
  });
 }

 /**
  * Toggle video
  */
 async toggleVideo(enabled: boolean): Promise<void> {
  if (!this.mediasoupSocket) {
   throw new Error('MediaSoup socket not connected');
  }

  this.mediasoupSocket.emit('media_action', {
   consultationId: this.consultationStateSubject.value.consultationId,
   userId: this.getCurrentPatientId(),
   type: enabled ? 'CAMERA_ON' : 'CAMERA_OFF'
  });

  this.updateConsultationState({
   mediaStatus: {
    ...this.consultationStateSubject.value.mediaStatus,
    videoEnabled: enabled
   }
  });
 }

 /**
  * Toggle audio
  */
 async toggleAudio(enabled: boolean): Promise<void> {
  if (!this.mediasoupSocket) {
   throw new Error('MediaSoup socket not connected');
  }

  this.mediasoupSocket.emit('media_action', {
   consultationId: this.consultationStateSubject.value.consultationId,
   userId: this.getCurrentPatientId(),
   type: enabled ? 'MIC_ON' : 'MIC_OFF'
  });

  this.updateConsultationState({
   mediaStatus: {
    ...this.consultationStateSubject.value.mediaStatus,
    audioEnabled: enabled
   }
  });
 }

 /**
  * Leave consultation
  */
 async leaveConsultation(): Promise<void> {
  console.log(`[ConsultationRoomService] Leaving consultation`);

  // Disconnect all sockets
  this.disconnectAllSockets();

  // Reset state
  this.resetState();
 }

 /**
  * End consultation (patient side)
  */
 async endConsultation(consultationId: number): Promise<void> {
  try {
   // Call backend API to end consultation
   await this.http.post(`${environment.apiUrl}/consultation/${consultationId}/end`, {}).toPromise();

   // Disconnect and reset
   await this.leaveConsultation();
  } catch (error) {
   console.error(`[ConsultationRoomService] Failed to end consultation:`, error);
   throw error;
  }
 }

 /**
  * Get current consultation state
  */
 getCurrentState(): ConsultationRoomState {
  return this.consultationStateSubject.value;
 }

 /**
  * Get current media session state
  */
 getCurrentMediaState(): MediaSessionState {
  return this.mediaSessionStateSubject.value;
 }

 // Private helper methods

 private async fetchInitialConsultationState(consultationId: number): Promise<void> {
  try {
   const response = await this.http.get(`${environment.apiUrl}/consultation/${consultationId}/status`).toPromise() as any;
   this.updateConsultationStateFromBackend(response);
  } catch (error) {
   console.error(`[ConsultationRoomService] Failed to fetch initial state:`, error);
  }
 }

 private updateConsultationState(partialState: Partial<ConsultationRoomState>): void {
  const currentState = this.consultationStateSubject.value;
  const newState = { ...currentState, ...partialState };
  this.consultationStateSubject.next(newState);
 }

 private updateMediaSessionState(partialState: Partial<MediaSessionState>): void {
  const currentState = this.mediaSessionStateSubject.value;
  const newState = { ...currentState, ...partialState };
  this.mediaSessionStateSubject.next(newState);
 }

 private updateConsultationStateFromBackend(backendData: any): void {
  if (backendData) {
   this.updateConsultationState({
    practitionerPresent: backendData.practitionerPresent || false,
    practitionerName: backendData.practitionerName || '',
    participantCount: backendData.participantCount || 0
   });
  }
 }

 private addChatMessage(message: ChatMessage): void {
  const currentMessages = this.chatMessagesSubject.value;
  const updatedMessages = [...currentMessages, message];
  this.chatMessagesSubject.next(updatedMessages);
 }

 private getCurrentPatientId(): number {
  // Get from auth service or current context
  return 0; // Placeholder - implement based on auth
 }

 private disconnectAllSockets(): void {
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
 }

 private resetState(): void {
  this.consultationStateSubject.next({
   consultationId: 0,
   isConnected: false,
   practitionerPresent: false,
   practitionerName: '',
   sessionStatus: 'connecting',
   participantCount: 0,
   mediaStatus: {
    videoEnabled: false,
    audioEnabled: false,
    screenShareEnabled: false
   }
  });

  this.mediaSessionStateSubject.next({
   routerId: '',
   rtpCapabilities: null,
   canJoinMedia: false,
   mediaInitialized: false,
   connectionQuality: 'disconnected'
  });

  this.chatMessagesSubject.next([]);
  this.participantsSubject.next([]);
 }
}

import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ToastService } from '../services/toast/toast.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, interval } from 'rxjs';
import {
  PractitionerConsultationRoomService,
  PractitionerConsultationState,
  PractitionerMediaSessionState,
  ConsultationParticipant,
  WebSocketNotification,
  ConsultationEvent,
  TypingUser
} from '../services/practitioner-consultation-room.service';

import { PractitionerChatComponent, TypingIndicator } from '../components/practitioner-chat/practitioner-chat.component';
import { PractitionerEnhancedWebSocketService } from '../services/practitioner-enhanced-websocket.service';
import { AudioAlertService } from '../services/audio-alert.service';
import { MediaPermissionService } from '../services/media-permission.service';
import { ConfirmationDialogService } from '../services/confirmation-dialog.service';

@Component({
  selector: 'app-practitioner-consultation-room',
  standalone: true,
  imports: [CommonModule, FormsModule, PractitionerChatComponent],
  styleUrls: ['./practitioner-consultation-room.component.scss'],
  templateUrl: './practitioner-consultation-room.component.html'
})
export class PractitionerConsultationRoomComponent implements OnInit, OnDestroy {
  pendingParticipant: {
    role: 'EXPERT' | 'GUEST';
    email: string;
    firstName: string;
    lastName: string;
    notes?: string;
  } = {
      role: 'EXPERT',
      email: '',
      firstName: '',
      lastName: '',
      notes: ''
    };
  pendingParticipants: Array<{
    role: 'EXPERT' | 'GUEST';
    email: string;
    firstName: string;
    lastName: string;
    notes?: string;
  }> = [];

  addPendingParticipant() {
    if (!this.pendingParticipant.email || !this.pendingParticipant.firstName) return;
    this.pendingParticipants.push({ ...this.pendingParticipant });
    this.pendingParticipant = {
      role: 'EXPERT',
      email: '',
      firstName: '',
      lastName: '',
      notes: ''
    };
  }

  removePendingParticipant(index: number) {
    this.pendingParticipants.splice(index, 1);
  }

  async sendAllPendingParticipants() {
    for (const p of this.pendingParticipants) {
      try {
        const name = `${p.firstName} ${p.lastName}`.trim();
        await this.consultationRoomService.addParticipant(this.consultationId, {
          role: p.role,
          email: p.email,
          name,
          notes: p.notes
        });
      } catch (err) {
      }
    }
    this.pendingParticipants = [];

  }
  @ViewChild('videoElement', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('chatContainer', { static: false }) chatContainer!: ElementRef<HTMLDivElement>;

  private destroy$ = new Subject<void>();
  public practitionerId: number = 0; // This should come from auth service

  // Component state
  consultationState: PractitionerConsultationState | null = null;
  mediaSessionState: PractitionerMediaSessionState | null = null;
  chatMessages: import('../services/practitioner-consultation-room.service').ChatMessage[] = [];
  participants: ConsultationParticipant[] = [];

  notifications: WebSocketNotification[] = [];
  events: ConsultationEvent[] = [];
  connectionStatus = { consultation: false, chat: false, media: false };

  isLoading = true;
  error: string | null = null;
  newMessage = '';
  showWaitingRoomAlert = false;
  consultationDuration = '';

  showNotifications = false;
  showEvents = false;


  typingUsers: TypingUser[] = [];
  get typingIndicators(): TypingIndicator[] {
    return this.typingUsers.map(user => ({
      userId: user.userId,
      userName: user.userName,
      typing: user.isTyping
    }));
  }
  unreadMessageCount = 0;
  showChat = false;
  consultationId = 0;

  isVideoEnabled = false;
  isAudioEnabled = false;
  isScreenSharing = false;
  selectedCamera = '';
  selectedMicrophone = '';

  // New UI state properties
  showSidebar = true;
  activeSidebarTab: 'participants' | 'chat' | 'activity' = 'participants';
  showSettingsMenu = false;
  isMobileView = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private consultationRoomService: PractitionerConsultationRoomService,
    private toastService: ToastService,
    private enhancedWebSocketService: PractitionerEnhancedWebSocketService,
    private audioAlertService: AudioAlertService,
    private mediaPermissionService: MediaPermissionService,
    private confirmationService: ConfirmationDialogService
  ) { }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const consultationId = +params['id'];

      if (consultationId) {
        this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
          this.practitionerId = +queryParams['practitionerId'] || 1;
          this.initializeConsultationRoom(consultationId);
        });
      } else {
        this.error = 'Invalid consultation ID';
        this.isLoading = false;
      }
    });

    this.setupServiceSubscriptions();
    this.startConsultationTimer();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.consultationRoomService.leaveConsultation();
  }

  /**
   * Initialize consultation room
   */
  private async initializeConsultationRoom(consultationId: number): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      this.consultationId = consultationId;

      // Setup service subscriptions first
      this.setupServiceSubscriptions();

      // Initialize the consultation room service
      await this.consultationRoomService.initializePractitionerConsultationRoom(consultationId, this.practitionerId);

      // Initialize enhanced WebSocket connection
      await this.initializeEnhancedWebSocket(consultationId);

      // Explicitly request chat history after all connections are ready
      setTimeout(() => {
        this.consultationRoomService.requestChatHistory(100, 0).catch(err => {
          console.warn('Failed to request chat history on init:', err);
        });
      }, 1000);

      this.isLoading = false;
      this.toastService.showSuccess('Consultation room ready! You can now chat, video call, and share files.');
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to initialize consultation room. Please try again.';
      this.toastService.showError(errorMessage);
      this.error = errorMessage;
      this.isLoading = false;
    }
  }

  /**
   * Initialize enhanced WebSocket connection
   */
  private async initializeEnhancedWebSocket(consultationId: number): Promise<void> {
    try {
      await this.enhancedWebSocketService.initializeEnhancedConsultation(
        consultationId,
        this.practitionerId,
        'PRACTITIONER'
      );

      // Setup enhanced event listeners
      this.setupEnhancedWebSocketSubscriptions();

    } catch (error) {
    }
  }

  /**
   * Setup enhanced WebSocket subscriptions
   */
  private setupEnhancedWebSocketSubscriptions(): void {
    // Patient waiting events
    this.enhancedWebSocketService.patientWaiting$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.showWaitingRoomAlert = true;
        this.audioAlertService.playNotificationSound({ type: 'patient_joined' });
        this.toastService.showInfo(`Patient ${data.patientName || 'Someone'} is waiting to join`);
      });

    // System notifications
    this.enhancedWebSocketService.systemNotification$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notification => {
        this.toastService.showInfo(notification.message || 'System notification');
      });

    // Media permission guidance
    this.enhancedWebSocketService.mediaPermissionGuidance$
      .pipe(takeUntil(this.destroy$))
      .subscribe(guidance => {
        this.toastService.showWarning(guidance.message || 'Media permission issue detected');
      });

    // Participant events
    this.enhancedWebSocketService.participantInvited$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showSuccess(`${data.participantName} has been invited to join`);
      });

    this.enhancedWebSocketService.participantRemoved$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showInfo('A participant has been removed from the consultation');
      });
  }

  /**
   * Setup subscriptions to service observables
   */
  private setupServiceSubscriptions(): void {
    // Consultation state updates
    this.consultationRoomService.consultationState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.consultationState = state;
        if (state.waitingRoomStatus.hasWaitingPatients) {
          this.showWaitingRoomAlert = true;
        }
      });

    // Media session state updates
    this.consultationRoomService.mediaSessionState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.mediaSessionState = state;
      });

    // Chat messages updates
    this.consultationRoomService.chatMessages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => {
        this.chatMessages = messages as import('../services/practitioner-consultation-room.service').ChatMessage[];
        // Scroll to bottom after messages load
        setTimeout(() => this.scrollChatToBottom(), 100);
      });

    // Participants updates
    this.consultationRoomService.participants$
      .pipe(takeUntil(this.destroy$))
      .subscribe(participants => {
        this.toastService.showInfo('Participants updated');
        this.participants = participants;
      });

    // Patient joined waiting room
    this.consultationRoomService.patientJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showInfo('Patient joined waiting room');
        this.showWaitingRoomAlert = true;
      });

    // Patient admitted to consultation
    this.consultationRoomService.patientAdmitted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showSuccess('Patient admitted to consultation');
        this.showWaitingRoomAlert = false;
      });

    // Patient left consultation
    this.consultationRoomService.patientLeft$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showWarning('Patient left consultation');
      });

    // Media session ready
    this.consultationRoomService.mediaSessionReady$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showSuccess('Media session ready');
        this.initializeMedia();
      });

    // Consultation ended
    this.consultationRoomService.consultationEnded$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showInfo('Consultation ended');
        this.handleConsultationEnded();
      });

    // Waiting room updates
    this.consultationRoomService.waitingRoomUpdate$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.toastService.showInfo('Waiting room updated');
        if (data.waitingCount > 0) {
          this.showWaitingRoomAlert = true;
        }
      });

    // Enhanced notification subscriptions
    this.consultationRoomService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.notifications = notifications;
      });

    this.consultationRoomService.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe(events => {
        this.events = events;
      });

    this.consultationRoomService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.connectionStatus = status;
      });

    // Enhanced chat subscriptions
    this.consultationRoomService.typingUsers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(typingUsers => {
        this.typingUsers = typingUsers;
      });

    this.consultationRoomService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        this.unreadMessageCount = count;
      });

    this.consultationRoomService.showChat$
      .pipe(takeUntil(this.destroy$))
      .subscribe(showChat => {
        this.showChat = showChat;
      });

  }

  /**
   * Initialize media (camera/microphone)
   */
  private async initializeMedia(): Promise<void> {
    try {
      // Request media permissions with enhanced constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      // Attach stream to video element
      if (this.videoElement?.nativeElement) {
        this.videoElement.nativeElement.srcObject = stream;

        // Ensure video plays
        try {
          await this.videoElement.nativeElement.play();
        } catch (playError) {
        }
      } else {
      }

      this.isVideoEnabled = true;
      this.isAudioEnabled = true;

      // Update consultation service state
      await this.consultationRoomService.updateLocalMediaState({
        video: true,
        audio: true,
        stream: stream
      });

      this.toastService.showSuccess('Camera and microphone ready');
    } catch (error: any) {
      let errorMessage = 'Failed to access camera/microphone. ';
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please grant camera and microphone permissions.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera or microphone found.';
      } else {
        errorMessage += error.message || 'Unknown error';
      }

      this.toastService.showError(errorMessage);
    }
  }

  /**
   * Start consultation timer
   */
  private startConsultationTimer(): void {
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.consultationState?.consultationStartTime) {
          const startTime = new Date(this.consultationState.consultationStartTime);
          const now = new Date();
          const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);

          const hours = Math.floor(duration / 3600);
          const minutes = Math.floor((duration % 3600) / 60);
          const seconds = duration % 60;

          this.consultationDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
      });
  }

  /**
   * Scroll chat to bottom
   */
  private scrollChatToBottom(): void {
    setTimeout(() => {
      if (this.chatContainer?.nativeElement) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  /**
   * Handle consultation ended
   */
  private handleConsultationEnded(): void {
    // Show confirmation dialog or navigate away
    setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 3000);
  }

  // Public methods for template

  /**
   * Admit patient from waiting room
   */
  async admitPatient(): Promise<void> {
    if (!this.consultationState?.consultationId) return;

    try {
      await this.consultationRoomService.admitPatient(this.consultationState.consultationId);
      this.toastService.showSuccess('Patient admitted successfully');
    } catch (error) {
      this.toastService.showError('Failed to admit patient');
      this.error = 'Failed to admit patient';
    }
  }

  /**
   * Send chat message
   */
  async sendMessage(): Promise<void> {
    if (!this.newMessage.trim()) return;

    try {
      await this.consultationRoomService.sendMessage(this.newMessage, this.practitionerId);
      this.newMessage = '';
    } catch (error) {
      this.toastService.showError('Failed to send message');
      this.error = 'Failed to send message';
    }
  }

  /**
   * Send chat message (for chat component integration)
   */
  async sendChatMessage(content: string): Promise<void> {
    try {
      if (!content || !content.trim()) {
        this.toastService.showWarning('Please enter a message');
        return;
      }

      if (!this.practitionerId || this.practitionerId === 0) {
        this.toastService.showError('Invalid practitioner ID. Please refresh the page.');
        return;
      }

      if (!this.consultationId || this.consultationId === 0) {
        this.toastService.showError('Invalid consultation ID. Please refresh the page.');
        return;
      }

      await this.consultationRoomService.sendMessage(content.trim(), this.practitionerId);
      this.toastService.showSuccess('Message sent!');
    } catch (error: any) {
      this.toastService.showError(error?.message || 'Failed to send chat message. Please check your connection.');
    }
  }

  /**
   * Send file message
   */
  async sendFileMessage(file: File): Promise<void> {
    try {
      await this.consultationRoomService.sendFileMessage(file, this.practitionerId);
    } catch (error) {
      this.toastService.showError('Failed to send file');
    }
  }

  /**
   * Start typing indicator
   */
  startTypingIndicator(): void {
    this.consultationRoomService.startTypingIndicator(this.practitionerId, 'Practitioner');
  }

  /**
   * Stop typing indicator
   */
  stopTypingIndicator(): void {
    this.consultationRoomService.stopTypingIndicator(this.practitionerId, 'Practitioner');
  }

  /**
   * Mark all messages as read
   */
  markAllMessagesAsRead(): void {
    this.consultationRoomService.markAllMessagesAsRead(this.practitionerId);
  }

  /**
   * Check if more messages can be loaded
   */
  canLoadMoreMessages(): boolean {
    return this.consultationRoomService.canLoadMoreMessages;
  }

  /**
   * Load more chat messages (pagination)
   */
  loadMoreChatMessages(): void {
    this.consultationRoomService.loadMoreMessages();
  }

  /**
   * Close chat
   */
  closeChat(): void {
    this.consultationRoomService.toggleChatVisibility();
  }

  /**
   * Toggle video with enhanced WebRTC handling
   */
  async toggleVideo(): Promise<void> {
    try {
      const newState = !this.isVideoEnabled;

      // If turning on video and no stream exists, initialize media first
      if (newState && !this.videoElement?.nativeElement?.srcObject) {
        await this.initializeMedia();
        return;
      }

      // Toggle the video tracks
      if (this.videoElement?.nativeElement?.srcObject) {
        const stream = this.videoElement.nativeElement.srcObject as MediaStream;
        const videoTracks = stream.getVideoTracks();

        videoTracks.forEach(track => {
          track.enabled = newState;
        });
      }

      // Update state in service
      await this.consultationRoomService.toggleVideo(newState);
      this.isVideoEnabled = newState;

      this.toastService.showSuccess(
        `Video ${newState ? 'enabled' : 'disabled'} successfully`
      );

    } catch (error: any) {
      this.toastService.showError('Failed to toggle video. Please check your camera permissions.');
    }
  }

  /**
   * Toggle audio with enhanced WebRTC handling
   */
  async toggleAudio(): Promise<void> {
    try {
      const newState = !this.isAudioEnabled;

      // If turning on audio and no stream exists, initialize media first
      if (newState && !this.videoElement?.nativeElement?.srcObject) {
        await this.initializeMedia();
        return;
      }

      // Toggle the audio tracks
      if (this.videoElement?.nativeElement?.srcObject) {
        const stream = this.videoElement.nativeElement.srcObject as MediaStream;
        const audioTracks = stream.getAudioTracks();

        audioTracks.forEach(track => {
          track.enabled = newState;
        });
      }

      // Update state in service
      await this.consultationRoomService.toggleAudio(newState);
      this.isAudioEnabled = newState;

      this.toastService.showSuccess(
        `Microphone ${newState ? 'enabled' : 'disabled'} successfully`
      );

    } catch (error: any) {
      this.toastService.showError('Failed to toggle microphone. Please check your microphone permissions.');
    }
  }

  /**
   * Start screen sharing with enhanced WebRTC
   */
  async startScreenShare(): Promise<void> {
    try {
      await this.consultationRoomService.startScreenShare();
      this.isScreenSharing = true;
      this.toastService.showSuccess('Screen sharing started successfully');
    } catch (error) {
      this.toastService.showError('Failed to start screen sharing. Please try again.');
    }
  }

  /**
   * Stop screen sharing
   */
  async stopScreenShare(): Promise<void> {
    try {
      await this.consultationRoomService.stopScreenShare();
      this.isScreenSharing = false;
      this.toastService.showSuccess('Screen sharing stopped');
    } catch (error) {
      this.toastService.showError('Failed to stop screen sharing');
    }
  }

  /**
   * Switch camera device
   */
  async switchCamera(deviceId: string): Promise<void> {
    try {
      await this.consultationRoomService.switchCamera(deviceId);
      this.selectedCamera = deviceId;
      this.toastService.showSuccess('Camera device changed successfully');
    } catch (error) {
      this.toastService.showError('Failed to switch camera device');
    }
  }

  /**
   * Switch microphone device
   */
  async switchMicrophone(deviceId: string): Promise<void> {
    try {
      await this.consultationRoomService.switchMicrophone(deviceId);
      this.selectedMicrophone = deviceId;
      this.toastService.showSuccess('Microphone device changed successfully');
    } catch (error) {
      this.toastService.showError('Failed to switch microphone device');
    }
  }

  /**
   * Get available camera devices
   */
  get availableCameras(): MediaDeviceInfo[] {
    return this.mediaSessionState?.devices?.cameras || [];
  }

  /**
   * Get available microphone devices
   */
  get availableMicrophones(): MediaDeviceInfo[] {
    return this.mediaSessionState?.devices?.microphones || [];
  }

  /**
   * Check if media permissions are granted
   */
  get hasMediaPermissions(): boolean {
    return this.consultationRoomService.getLocalMediaStream() !== null;
  }

  /**
   * Get connection quality status
   */
  get connectionQuality(): string {
    return this.mediaSessionState?.connectionQuality || 'disconnected';
  }

  /**
   * Get connection quality color for UI
   */
  get connectionQualityColor(): string {
    switch (this.connectionQuality) {
      case 'good': return 'green';
      case 'fair': return 'orange';
      case 'poor': return 'red';
      default: return 'gray';
    }
  }

  /**
   * DISABLED: End consultation
   * Note: Practitioners cannot end consultations from the consultation room.
   * Consultations can only be ended by patients or through the dashboard.
   */
  /*
  async endConsultation(): Promise<void> {
    if (!this.consultationState?.consultationId) return;

    const confirmed = await this.confirmationService.confirmWarning(
      'This will end the consultation for all participants. Are you sure you want to continue?',
      'End Consultation',
      'End Consultation',
      'Cancel'
    );

    if (!confirmed) return;

    try {
      await this.consultationRoomService.endConsultation(
        this.consultationState.consultationId,
        'Completed by practitioner'
      );
      this.toastService.notifySuccess('end', 'Consultation');
      this.router.navigate(['/dashboard']);
    } catch (error) {
      this.toastService.notifyError('end', 'consultation', 'An unexpected error occurred');
      this.error = 'Failed to end consultation';
    }
  }
  */


  /**
   * Retry initialization after a failure
   */
  async retryInitialization(): Promise<void> {
    this.error = null;

    if (this.consultationId) {
      await this.initializeConsultationRoom(this.consultationId);
    } else {
      this.error = 'Consultation ID not found. Please return to dashboard and try again.';
    }
  }

  /**
   * Leave consultation and return to dashboard
   * This does NOT end the consultation - it only disconnects the practitioner
   */
  async leaveConsultation(): Promise<void> {
    try {
      // Confirm before leaving
      const confirmed = await this.confirmationService.confirm(
        'Are you sure you want to leave this consultation? The consultation will continue in the background.',
        'Leave Consultation?',
        'Leave',
        'Stay',
        'warning'
      );

      if (!confirmed) {
        return;
      }

      // Clean up and disconnect
      await this.consultationRoomService.leaveConsultation();

      // Stop the timer by triggering destroy
      this.destroy$.next();

      this.toastService.showInfo('You have left the consultation');
      this.router.navigate(['/dashboard']);
    } catch (error) {
      this.toastService.showWarning('Disconnecting from consultation...');
      // Navigate anyway even if there's an error
      this.router.navigate(['/dashboard']);
    }
  }

  /**
   * Add participant (expert or guest) to consultation
   */
  async addParticipant(participantData: {
    role: 'EXPERT' | 'GUEST';
    email: string;
    name: string;
    notes?: string;
  }): Promise<void> {
    if (!this.consultationState?.consultationId) {
      this.error = 'No active consultation';
      return;
    }
    try {
      const response = await this.consultationRoomService.addParticipant(
        this.consultationState.consultationId,
        participantData
      );

      // Show debug info as toast for developer feedback
      this.toastService.showInfo('Add Participant: Full response received.');
      this.toastService.showInfo('Add Participant: Response data processed.');
      if (response?.data?.emailSent) {
        this.toastService.showSuccess(`✅ Participant added and invitation email sent to ${participantData.email}`);
      } else if (response?.data?.emailError) {
        this.toastService.showWarning(`⚠️ Participant added but email failed: ${response.data.emailError}`);
      } else {
        this.toastService.showSuccess('✅ Participant added successfully');
      }
      // Real-time update will come through WebSocket
    } catch (error) {
      this.toastService.showError('❌ Failed to add participant');
      this.error = 'Failed to add participant';
    }
  }

  /**
   * Remove participant from consultation
   */
  async removeParticipant(participantId: number): Promise<void> {
    if (!this.consultationState?.consultationId) {
      this.error = 'No active consultation';
      return;
    }

    try {
      await this.consultationRoomService.removeParticipant(
        this.consultationState.consultationId,
        participantId
      );
      this.toastService.showSuccess('Participant removed successfully');
    } catch (error) {
      this.toastService.showError('Failed to remove participant');
      this.error = 'Failed to remove participant';
    }
  }

  /**
   * Admit patient from waiting room using the new service method
   */
  async admitPatientFromWaitingRoom(patientId?: number): Promise<void> {
    if (!this.consultationState?.consultationId) {
      this.error = 'No active consultation';
      return;
    }

    try {
      await this.consultationRoomService.admitPatientFromWaitingRoom(
        this.consultationState.consultationId,
        patientId
      );
      this.showWaitingRoomAlert = false;
      this.toastService.showSuccess('Patient admitted from waiting room');
    } catch (error) {
      this.toastService.showError('Failed to admit patient from waiting room');
      this.error = 'Failed to admit patient';
    }
  }

  // UI State Management for Participant Management

  showAddParticipantModal = false;
  newParticipant = {
    role: 'EXPERT' as 'EXPERT' | 'GUEST',
    email: '',
    firstName: '',
    lastName: '',
    notes: ''
  };
  inviteLoading = false;
  inviteError: string | null = null;
  inviteLink: string | null = null;

  /**
   * Open add participant modal
   */
  openAddParticipantModal(): void {
    this.showAddParticipantModal = true;
    this.resetParticipantForm();
    this.inviteError = null;
    this.inviteLink = null;
    this.inviteLoading = false;
  }

  /**
   * Close add participant modal
   */
  closeAddParticipantModal(): void {
    this.showAddParticipantModal = false;
    this.resetParticipantForm();
    this.inviteError = null;
    this.inviteLink = null;
    this.inviteLoading = false;
  }

  /**
   * Reset participant form
   */
  private resetParticipantForm(): void {
    this.newParticipant = {
      role: 'EXPERT',
      email: '',
      firstName: '',
      lastName: '',
      notes: ''
    };
  }

  /**
   * Submit add participant form
   */
  async submitAddParticipant(): Promise<void> {
    this.inviteError = null;
    this.inviteLink = null;
    this.inviteLoading = true;

    // Validate required fields
    if (!this.newParticipant.email || !this.newParticipant.firstName) {
      this.inviteError = 'Please fill in all required fields (Email and First Name)';
      this.inviteLoading = false;
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.newParticipant.email)) {
      this.inviteError = 'Please enter a valid email address';
      this.inviteLoading = false;
      return;
    }

    try {
      const fullName = `${this.newParticipant.firstName} ${this.newParticipant.lastName}`.trim();

      // Add participant and get response with email status
      const addParticipantResponse = await this.consultationRoomService.addParticipant(
        this.consultationId,
        {
          role: this.newParticipant.role,
          email: this.newParticipant.email.trim().toLowerCase(),
          name: fullName,
          notes: this.newParticipant.notes?.trim()
        }
      );

      console.log('🔍 [Add Participant] Full Response:', addParticipantResponse);
      console.log('🔍 [Add Participant] Response data:', addParticipantResponse?.data);
      console.log('🔍 [Add Participant] Email sent:', addParticipantResponse?.data?.emailSent);

      // Check if email was sent successfully - accessing nested data structure
      const emailSent = addParticipantResponse?.data?.emailSent !== false;
      const emailError = addParticipantResponse?.data?.emailError || null;

      console.log('🔍 [Add Participant] Evaluated emailSent:', emailSent);
      console.log('🔍 [Add Participant] Email error:', emailError);

      // Generate magic link for manual sharing
      try {
        const magicLinkResponse = await this.consultationRoomService.generateMagicLink(
          this.consultationId,
          {
            email: this.newParticipant.email.trim().toLowerCase(),
            role: this.newParticipant.role,
            name: fullName,
            notes: this.newParticipant.notes?.trim(),
            expiresInMinutes: 1440
          }
        );

        this.inviteLink = magicLinkResponse?.magicLink || '';
      } catch (linkError) {
      }

      this.inviteLoading = false;

      // Show enhanced toast based on email delivery status
      if (emailSent) {
        this.toastService.showSuccessWithAction(
          `✅ ${fullName} invited! Email sent to ${this.newParticipant.email}`,
          'Copy Link',
          () => this.copyInviteLink()
        );
      } else {
        this.toastService.showWarningWithAction(
          `⚠️ ${fullName} invited, but email failed${emailError ? `: ${emailError}` : ''}. Share link manually.`,
          'Copy Link',
          () => this.copyInviteLink()
        );
      }

      // Log success - using 'participant_joined' type as closest match for invitation
      this.events.unshift({
        id: `invite_${Date.now()}`,
        type: 'consultation_status_changed',
        title: emailSent ? 'Participant Invited (Email Sent)' : 'Participant Invited (Manual Link)',
        description: `${fullName} (${this.newParticipant.role}) invited to join` + (emailSent ? '' : ' - Email failed, use manual link'),
        timestamp: new Date(),
        severity: emailSent ? 'success' : 'warning'
      });

    } catch (err: any) {
      // Extract error message
      const errorMessage = err?.error?.message || err?.message || 'Failed to invite participant';
      this.inviteError = errorMessage;
      this.inviteLoading = false;

      // Show error toast with retry option
      this.toastService.showErrorWithRetry(
        `❌ Failed to invite ${this.newParticipant.email}: ${errorMessage}`,
        () => this.submitAddParticipant()
      );

      // Log error event
      this.events.unshift({
        id: `error_${Date.now()}`,
        type: 'consultation_status_changed',
        title: 'Invitation Failed',
        description: `Failed to invite ${this.newParticipant.email}: ${errorMessage}`,
        timestamp: new Date(),
        severity: 'error'
      });
    }
  }

  /**
   * Copy invitation link to clipboard
   */
  async copyInviteLink(): Promise<void> {
    if (!this.inviteLink) {
      this.toastService.showWarning('No invitation link available to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.inviteLink);
      this.toastService.showSuccess('Invitation link copied to clipboard! Share this link with the participant.');
    } catch (error) {
      this.toastService.showError('Failed to copy link. Please copy it manually.');
    }
  }


  /**
   * Toggle notifications panel
   */
  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      this.showEvents = false;
    }
  }

  /**
   * Toggle events panel
   */
  toggleEvents(): void {
    this.showEvents = !this.showEvents;
    if (this.showEvents) {
      this.showNotifications = false;
    }
  }

  /**
   * Clear notification
   */
  clearNotification(id: string): void {
    this.consultationRoomService.clearNotification(id);
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications(): void {
    this.consultationRoomService.clearAllNotifications();
  }

  /**
   * Handle notification action
   */
  handleNotificationAction(action: string, data?: any): void {
    this.consultationRoomService.handleNotificationAction(action, data);

    switch (action) {
      case 'navigate_dashboard':
        this.router.navigate(['/dashboard']);
        break;
      case 'show_waiting_room':
        this.showWaitingRoomAlert = true;
        break;
      case 'open_chat':
        const chatContainer = document.querySelector('.chat-panel');
        if (chatContainer) {
          chatContainer.scrollIntoView({ behavior: 'smooth' });
        }
        break;
    }
  }

  /**
   * Get unread notification count
   */
  getUnreadNotificationCount(): number {
    return this.notifications.filter(n => n.type === 'error' || n.type === 'warning').length;
  }

  /**
   * Get notification icon
   */
  getNotificationIcon(type: string): string {
    switch (type) {
      case 'success': return '✅';
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return 'ℹ️';
    }
  }

  /**
   * Get event severity icon
   */
  getEventSeverityIcon(severity: string): string {
    switch (severity) {
      case 'success': return '🟢';
      case 'info': return '🔵';
      case 'warning': return '🟡';
      case 'error': return '🔴';
      default: return '🔵';
    }
  }

  /**
   * Format notification/event timestamp
   */
  formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    return timestamp.toLocaleDateString();
  }

  /**
   * Get connection status display
   */
  getConnectionStatusDisplay(): { icon: string; text: string; color: string } {
    const allConnected = this.connectionStatus.consultation && this.connectionStatus.chat && this.connectionStatus.media;
    const someConnected = this.connectionStatus.consultation || this.connectionStatus.chat || this.connectionStatus.media;

    if (allConnected) {
      return { icon: '🟢', text: 'All Services Connected', color: 'success' };
    } else if (someConnected) {
      return { icon: '🟡', text: 'Partial Connection', color: 'warning' };
    } else {
      return { icon: '🔴', text: 'Disconnected', color: 'danger' };
    }
  }

  /**
   * Track notifications for ngFor performance
   */
  trackNotification(index: number, notification: WebSocketNotification): string {
    return notification.id;
  }

  /**
   * Track events for ngFor performance
   */
  trackEvent(index: number, event: ConsultationEvent): string {
    return event.id;
  }

  // Utility Methods

  /**
   * Dismiss waiting room alert
   */
  dismissWaitingRoomAlert(): void {
    this.showWaitingRoomAlert = false;
  }

  /**
   * Format message timestamp
   */
  formatMessageTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Get participant display name
   */
  getParticipantName(participant: ConsultationParticipant): string {
    return `${participant.firstName} ${participant.lastName}`.trim() || 'Unknown';
  }

  /**
   * Get connection quality icon
   */
  getConnectionQualityIcon(): string {
    switch (this.mediaSessionState?.connectionQuality) {
      case 'good': return '🟢';
      case 'fair': return '🟡';
      case 'poor': return '🔴';
      default: return '⚫';
    }
  }

  /**
   * Get session status display text
   */
  getSessionStatusText(): string {
    switch (this.consultationState?.sessionStatus) {
      case 'connecting': return 'Connecting...';
      case 'waiting': return 'Waiting for patient';
      case 'active': return 'Active consultation';
      case 'ended': return 'Consultation ended';
      case 'error': return 'Connection error';
      default: return 'Unknown status';
    }
  }

  /**
   * Check if consultation is active
   */
  isConsultationActive(): boolean {
    return this.consultationState?.sessionStatus === 'active' && this.consultationState?.patientPresent;
  }

  // ================ ENHANCED REAL-TIME EVENT HANDLERS ================

  /**
   * Handle patient admitted from real-time status panel
   */
  onPatientAdmitted(patientId: number): void {
    this.showWaitingRoomAlert = false;
    this.toastService.showSuccess('Patient admitted successfully');

    // Play success sound
    this.audioAlertService.playNotificationSound({ type: 'consultation_started' });
  }

  /**
   * Handle participant removed from real-time status panel
   */
  onParticipantRemoved(participantId: number): void {
    this.toastService.showInfo('Participant removed from consultation');

    // Update local participants list
    this.participants = this.participants.filter(p => p.id !== participantId);
  }

  /**
   * Handle media permission error from real-time status panel
   */
  onMediaPermissionError(errorData: any): void {
    if (errorData.errorType === 'camera_denied' || errorData.errorType === 'microphone_denied') {
      this.toastService.showWarning('Media permission denied. Please check your browser settings.');
    } else if (errorData.errorType === 'device_unavailable') {
      this.toastService.showError('Media device not available. Please check your camera and microphone.');
    } else if (errorData.errorType === 'device_in_use') {
      this.toastService.showWarning('Media device is in use by another application.');
    }
  }

  /**
   * Check if media controls should be enabled
   */
  areMediaControlsEnabled(): boolean {
    return (this.mediaSessionState?.canJoinMedia || false) && this.isConsultationActive();
  }

  // ================ NEW UI HELPER METHODS ================

  /**
   * Toggle sidebar visibility
   */
  toggleSidebar(): void {
    this.showSidebar = !this.showSidebar;
  }

  /**
   * Get total participants with video enabled
   */
  getTotalParticipantsWithVideo(): number {
    let count = 0;
    if (this.isVideoEnabled) count++;
    if (this.consultationState?.patientPresent) count++;
    if (this.isScreenSharing) count++;
    return count;
  }

  /**
   * Get connection status icon
   */
  getConnectionIcon(): string {
    const { consultation, chat, media } = this.connectionStatus;
    if (consultation && chat && media) return '🟢';
    if (consultation || chat || media) return '🟡';
    return '🔴';
  }

  /**
   * Get connection status text
   */
  getConnectionText(): string {
    const { consultation, chat, media } = this.connectionStatus;
    if (consultation && chat && media) return 'All services connected';
    if (consultation || chat || media) return 'Partially connected';
    return 'Disconnected';
  }

  /**
   * Get participant icon based on role
   */
  getParticipantIcon(role: string): string {
    switch (role?.toUpperCase()) {
      case 'PRACTITIONER': return '👨‍⚕️';
      case 'PATIENT': return '🤝';
      case 'EXPERT': return '👨‍💼';
      case 'GUEST': return '👤';
      default: return '👥';
    }
  }

  /**
   * Format role for display
   */
  formatRole(role: string): string {
    switch (role?.toUpperCase()) {
      case 'PRACTITIONER': return 'Practitioner';
      case 'PATIENT': return 'Patient';
      case 'EXPERT': return 'Medical Expert';
      case 'GUEST': return 'Guest';
      default: return role;
    }
  }

  /**
   * Get event icon based on type
   */
  getEventIcon(type: string): string {
    switch (type) {
      case 'participant_joined': return '👋';
      case 'participant_left': return '👋';
      case 'message_received': return '💬';
      case 'media_status_changed': return '🎥';
      case 'waiting_room_update': return '🚪';
      case 'consultation_status_changed': return '📋';
      case 'connection_quality_changed': return '📶';
      default: return '•';
    }
  }

  /**
   * Send typing indicator
   */
  sendTypingIndicator(isTyping: boolean): void {
    // Implement typing indicator logic
  }

  /**
   * Check responsive layout on window resize
   */
  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    this.isMobileView = window.innerWidth < 768;
  }
}



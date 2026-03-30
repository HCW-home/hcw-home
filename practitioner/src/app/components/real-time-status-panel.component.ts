import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, timer } from 'rxjs';
import { AudioAlertService } from '../services/audio-alert.service';
import { MediaPermissionService, MediaPermissionStatus } from '../services/media-permission.service';
import { PractitionerEnhancedWebSocketService } from '../services/practitioner-enhanced-websocket.service';
import { ToastService, ToastType } from '../services/toast/toast.service';
import { ConfirmationDialogService } from '../services/confirmation-dialog.service';

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  reconnectAttempts: number;
  lastConnected?: Date;
  lastError?: string;
}

export interface ParticipantStatus {
  id: number;
  name: string;
  role: 'PRACTITIONER' | 'PATIENT' | 'EXPERT' | 'GUEST';
  isActive: boolean;
  connectionQuality: 'good' | 'fair' | 'poor';
  mediaStatus: {
    cameraEnabled: boolean;
    microphoneEnabled: boolean;
    cameraBlocked: boolean;
    microphoneBlocked: boolean;
  };
  joinedAt: Date;
  lastSeen?: Date;
}

export interface WaitingRoomStatus {
  hasWaitingPatients: boolean;
  waitingCount: number;
  patients: Array<{
    id: number;
    name: string;
    waitingTime: number; // in minutes
    estimatedTime: number; // in minutes
  }>;
}

export interface SystemMessage {
  id: string;
  type: 'user_joined' | 'user_left' | 'waiting_for_participant' | 'connection_quality' | 'media_permission' | 'system_notification';
  message: string;
  timestamp: Date;
  data?: any;
  priority: 'low' | 'medium' | 'high';
}

@Component({
  selector: 'app-real-time-status-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="real-time-status-panel">
      <!-- Connection Status -->
      <div class="connection-status" [class]="'status-' + connectionState.status">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span class="status-text">{{ getConnectionStatusText() }}</span>
        </div>
        <div *ngIf="connectionState.reconnectAttempts > 0" class="reconnect-info">
          Reconnection attempts: {{ connectionState.reconnectAttempts }}
        </div>
      </div>

      <!-- Waiting Room Status -->
      <div *ngIf="waitingRoomStatus.hasWaitingPatients" class="waiting-room-alert">
        <div class="alert-header">
          <span class="alert-icon">👥</span>
          <span class="alert-title">Patients Waiting ({{ waitingRoomStatus.waitingCount }})</span>
          <button class="sound-toggle" 
                  [class.active]="soundEnabled" 
                  (click)="toggleSoundNotifications()"
                  title="Toggle sound notifications">
            🔊
          </button>
        </div>
        <div class="waiting-patients">
          <div *ngFor="let patient of waitingRoomStatus.patients" class="waiting-patient">
            <div class="patient-info">
              <span class="patient-name">{{ patient.name }}</span>
              <span class="wait-time">Waiting {{ patient.waitingTime }}m</span>
            </div>
            <button class="admit-btn" (click)="admitPatient(patient.id)">
              Admit
            </button>
          </div>
        </div>
      </div>

      <!-- Participants List -->
      <div class="participants-section">
        <h3>Participants ({{ participants.length }})</h3>
        <div class="participants-list">
          <div *ngFor="let participant of participants" class="participant-item">
            <div class="participant-info">
              <div class="participant-avatar" [class]="'role-' + participant.role.toLowerCase()">
                {{ getParticipantInitials(participant.name) }}
              </div>
              <div class="participant-details">
                <span class="participant-name">{{ participant.name }}</span>
                <span class="participant-role">{{ participant.role.toLowerCase() }}</span>
                <div class="participant-status">
                  <span *ngIf="participant.isActive" class="status-active">Active</span>
                  <span *ngIf="!participant.isActive" class="status-inactive">
                    Away {{ getTimeAgo(participant.lastSeen) }}
                  </span>
                </div>
              </div>
            </div>
            
            <div class="participant-controls">
              <!-- Media Status Icons -->
              <div class="media-status">
                <button class="media-btn camera" 
                        [class.enabled]="participant.mediaStatus.cameraEnabled"
                        [class.blocked]="participant.mediaStatus.cameraBlocked"
                        [disabled]="!canControlMedia(participant)"
                        (click)="toggleParticipantCamera(participant.id)"
                        [title]="getCameraStatusText(participant.mediaStatus)">
                  📹
                </button>
                <button class="media-btn microphone" 
                        [class.enabled]="participant.mediaStatus.microphoneEnabled"
                        [class.blocked]="participant.mediaStatus.microphoneBlocked"
                        [disabled]="!canControlMedia(participant)"
                        (click)="toggleParticipantMicrophone(participant.id)"
                        [title]="getMicrophoneStatusText(participant.mediaStatus)">
                  🎤
                </button>
              </div>
              
              <!-- Connection Quality -->
              <div class="connection-quality" [class]="'quality-' + participant.connectionQuality">
                <span class="quality-indicator" 
                      [title]="'Connection: ' + participant.connectionQuality">
                  📶
                </span>
              </div>
              
              <!-- Remove Participant (for practitioners) -->
              <button *ngIf="canRemoveParticipant(participant)" 
                      class="remove-btn"
                      (click)="removeParticipant(participant.id)"
                      title="Remove participant">
                ❌
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- System Messages -->
      <div class="system-messages">
        <h3>Activity</h3>
        <div class="messages-list">
          <div *ngFor="let message of recentMessages" 
               class="system-message"
               [class]="'priority-' + message.priority">
            <div class="message-content">
              <span class="message-text">{{ message.message }}</span>
              <span class="message-time">{{ formatTime(message.timestamp) }}</span>
            </div>
            <div *ngIf="message.type === 'media_permission'" class="message-action">
              <button class="help-btn" (click)="showMediaHelp(message.data)">
                Help
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Participant Button -->
      <div class="add-participant-section" *ngIf="userRole === 'PRACTITIONER'">
        <button class="add-participant-btn" (click)="showAddParticipantDialog()">
          + Add Expert/Guest
        </button>
      </div>

      <!-- Media Permission Status -->
      <div class="media-permission-status" *ngIf="showMediaStatus">
        <h4>Media Permissions</h4>
        <div class="permission-item">
          <span class="permission-label">Camera:</span>
          <span class="permission-status" [class]="getCameraPermissionClass()">
            {{ getCameraPermissionText() }}
          </span>
          <button *ngIf="mediaPermissions.camera.blocked" 
                  class="permission-help-btn"
                  (click)="showCameraHelp()">
            Help
          </button>
        </div>
        <div class="permission-item">
          <span class="permission-label">Microphone:</span>
          <span class="permission-status" [class]="getMicrophonePermissionClass()">
            {{ getMicrophonePermissionText() }}
          </span>
          <button *ngIf="mediaPermissions.microphone.blocked" 
                  class="permission-help-btn"
                  (click)="showMicrophoneHelp()">
            Help
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./real-time-status-panel.component.scss']
})
export class RealTimeStatusPanelComponent implements OnInit, OnDestroy {
  @Input() consultationId!: number;
  @Input() userRole: 'PRACTITIONER' | 'PATIENT' | 'EXPERT' | 'GUEST' = 'PATIENT';
  @Input() showMediaStatus = true;
  @Output() participantAdmitted = new EventEmitter<number>();
  @Output() participantRemoved = new EventEmitter<number>();
  @Output() mediaPermissionError = new EventEmitter<any>();

  private destroy$ = new Subject<void>();

  connectionState: ConnectionState = {
    status: 'disconnected',
    reconnectAttempts: 0
  };

  waitingRoomStatus: WaitingRoomStatus = {
    hasWaitingPatients: false,
    waitingCount: 0,
    patients: []
  };

  participants: ParticipantStatus[] = [];
  recentMessages: SystemMessage[] = [];
  mediaPermissions: MediaPermissionStatus = {
    camera: { available: false, enabled: false, blocked: false, deviceCount: 0 },
    microphone: { available: false, enabled: false, blocked: false, deviceCount: 0 },
    lastChecked: new Date()
  };

  soundEnabled = true;

  constructor(
    private audioAlertService: AudioAlertService,
    private mediaPermissionService: MediaPermissionService,
    private webSocketService: PractitionerEnhancedWebSocketService,
    private toastService: ToastService,
    private confirmationService: ConfirmationDialogService
  ) { }

  ngOnInit(): void {
    this.initializeRealTimeFeatures();
    this.setupWebSocketListeners();
    this.checkMediaPermissions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeRealTimeFeatures(): void {
    this.connectionState = {
      status: 'connected',
      reconnectAttempts: 0
    };

    // Subscribe to media permission changes
    this.mediaPermissionService.getPermissionStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe(permissions => {
        this.mediaPermissions = permissions;
      });

    // Auto-refresh waiting room status
    timer(0, 10000) // Every 10 seconds
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateWaitingRoomStatus();
      });
  }

  private setupWebSocketListeners(): void {
    const socket = this.webSocketService['enhancedConsultationSocket'];
    if (!socket) return;

    // Patient joined waiting room
    socket.on('patient_waiting', (data: any) => {
      this.handlePatientWaiting(data);
      if (this.soundEnabled) {
        this.audioAlertService.playNotificationSound({ type: 'patient_joined' });
      }
    });

    // User joined/left events
    socket.on('user_joined', (data: any) => {
      this.addSystemMessage({
        type: 'user_joined',
        message: `${data.userRole} joined the consultation`,
        timestamp: new Date(data.joinedAt),
        priority: 'medium'
      });
    });

    socket.on('user_left', (data: any) => {
      this.addSystemMessage({
        type: 'user_left',
        message: `User left the consultation`,
        timestamp: new Date(data.leftAt),
        priority: 'medium'
      });
    });

    // Media permission guidance
    socket.on('media_permission_guidance', (data: any) => {
      this.addSystemMessage({
        type: 'media_permission',
        message: data.message,
        timestamp: new Date(),
        priority: 'high',
        data: data
      });
    });

    // System notifications
    socket.on('system_notification', (data: any) => {
      this.addSystemMessage({
        type: 'system_notification',
        message: this.getSystemNotificationMessage(data.messageType, data.messageData),
        timestamp: new Date(data.timestamp),
        priority: 'medium'
      });
    });

    // Participant updates
    socket.on('participants_updated', (data: any) => {
      this.participants = data.participants;
    });
  }

  private async checkMediaPermissions(): Promise<void> {
    try {
      await this.mediaPermissionService.checkAndRequestPermissions({ video: false, audio: false });
    } catch (error) {
      console.error('Failed to check media permissions:', error);
    }
  }

  private handlePatientWaiting(data: any): void {
    this.waitingRoomStatus = {
      hasWaitingPatients: true,
      waitingCount: data.waitingCount || 1,
      patients: data.patients || [{
        id: data.patientId,
        name: data.patientName || 'Patient',
        waitingTime: Math.floor((Date.now() - new Date(data.enteredAt).getTime()) / 60000),
        estimatedTime: data.estimatedTime || 5
      }]
    };
  }

  private addSystemMessage(message: Omit<SystemMessage, 'id'>): void {
    const newMessage: SystemMessage = {
      ...message,
      id: Date.now().toString() + Math.random().toString(36)
    };

    this.recentMessages.unshift(newMessage);
    if (this.recentMessages.length > 10) {
      this.recentMessages = this.recentMessages.slice(0, 10);
    }
  }

  private updateWaitingRoomStatus(): void {
    // This would typically make an API call to get current waiting room status
    // For now, we'll simulate it
  }

  // Template methods
  getConnectionStatusText(): string {
    switch (this.connectionState.status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'reconnecting': return 'Reconnecting...';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Connection Error';
      default: return 'Unknown';
    }
  }

  toggleSoundNotifications(): void {
    this.soundEnabled = !this.soundEnabled;
    this.audioAlertService.setEnabled(this.soundEnabled);
  }

  admitPatient(patientId: number): void {
    const socket = this.webSocketService['enhancedConsultationSocket'];
    if (socket) {
      socket.emit('admit_patient', { patientId });
      this.participantAdmitted.emit(patientId);
    }
  }

  async removeParticipant(participantId: number): Promise<void> {
    const confirmed = await this.confirmationService.confirmDanger(
      'This participant will be removed from the consultation. They will need to be re-invited to rejoin.',
      'Remove Participant',
      'Remove',
      'Cancel'
    );

    if (confirmed) {
      const socket = this.webSocketService['enhancedConsultationSocket'];
      if (socket) {
        socket.emit('remove_participant', { participantId });
        this.participantRemoved.emit(participantId);
        this.toastService.notifySuccess('remove', 'Participant');
      } else {
        this.toastService.notifyError('remove', 'participant', 'Connection not available');
      }
    }
  }

  toggleParticipantCamera(participantId: number): void {
    // Implementation for toggling participant camera
    console.log('Toggle camera for participant:', participantId);
  }

  toggleParticipantMicrophone(participantId: number): void {
    // Implementation for toggling participant microphone
    console.log('Toggle microphone for participant:', participantId);
  }

  canControlMedia(participant: ParticipantStatus): boolean {
    return this.userRole === 'PRACTITIONER' || participant.role === 'PATIENT';
  }

  canRemoveParticipant(participant: ParticipantStatus): boolean {
    return this.userRole === 'PRACTITIONER' && participant.role !== 'PRACTITIONER';
  }

  showAddParticipantDialog(): void {
    // Implementation for showing add participant dialog
    console.log('Show add participant dialog');
  }

  showMediaHelp(data: any): void {
    // Show media permission help dialog
    this.toastService.show(data.message, 5000, ToastType.INFO);
  }

  showCameraHelp(): void {
    this.toastService.show(this.mediaPermissionService.getPermissionGuideMessage('camera'), 5000, ToastType.INFO);
  }

  showMicrophoneHelp(): void {
    this.toastService.show(this.mediaPermissionService.getPermissionGuideMessage('microphone'), 5000, ToastType.INFO);
  }

  // Utility methods
  getParticipantInitials(name: string): string {
    return name.split(' ')
      .map(n => n.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  getTimeAgo(date?: Date): string {
    if (!date) return '';
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getCameraStatusText(mediaStatus: any): string {
    if (mediaStatus.cameraBlocked) return 'Camera blocked';
    if (mediaStatus.cameraEnabled) return 'Camera on';
    return 'Camera off';
  }

  getMicrophoneStatusText(mediaStatus: any): string {
    if (mediaStatus.microphoneBlocked) return 'Microphone blocked';
    if (mediaStatus.microphoneEnabled) return 'Microphone on';
    return 'Microphone off';
  }

  getCameraPermissionClass(): string {
    if (this.mediaPermissions.camera.blocked) return 'permission-blocked';
    if (this.mediaPermissions.camera.enabled) return 'permission-granted';
    return 'permission-unknown';
  }

  getMicrophonePermissionClass(): string {
    if (this.mediaPermissions.microphone.blocked) return 'permission-blocked';
    if (this.mediaPermissions.microphone.enabled) return 'permission-granted';
    return 'permission-unknown';
  }

  getCameraPermissionText(): string {
    if (!this.mediaPermissions.camera.available) return 'Not available';
    if (this.mediaPermissions.camera.blocked) return 'Blocked';
    if (this.mediaPermissions.camera.enabled) return 'Allowed';
    return 'Not requested';
  }

  getMicrophonePermissionText(): string {
    if (!this.mediaPermissions.microphone.available) return 'Not available';
    if (this.mediaPermissions.microphone.blocked) return 'Blocked';
    if (this.mediaPermissions.microphone.enabled) return 'Allowed';
    return 'Not requested';
  }

  private getSystemNotificationMessage(messageType: string, messageData: any): string {
    switch (messageType) {
      case 'waiting_time_update':
        return `Estimated waiting time updated: ${messageData.estimatedTime} minutes`;
      case 'connection_quality_warning':
        return 'Poor connection quality detected. Consider switching to a more stable network.';
      case 'participant_limit_reached':
        return 'Maximum number of participants reached for this consultation.';
      default:
        return 'System notification';
    }
  }
}

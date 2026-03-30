import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AudioAlertService } from './audio-alert.service';
import { EventBusService } from './event-bus.service';
import { AuthService } from '../auth/auth.service';
import { ToastService, ToastType } from './toast/toast.service';
import { Router } from '@angular/router';

export interface WaitingRoomNotification {
  consultationId: number;
  patientFirstName: string;
  patientInitials: string;
  joinTime: Date;
  language: string | null;
  message: string;
}

export interface DashboardState {
  isConnected: boolean;
  waitingPatientCount: number;
  hasNewNotifications: boolean;
  lastNotificationTime: Date | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardWebSocketService {

  public dashboardState$: ReturnType<BehaviorSubject<DashboardState>["asObservable"]>;
  public patientJoined$: ReturnType<Subject<WaitingRoomNotification>["asObservable"]>;

  // Initialize dashboard websocket connection
  public initializeDashboardConnection(practitionerId: number): void {
    this.practitionerId = practitionerId;
    if (this.socket) {
      this.disconnect();
    }
    this.socket = io(`${environment.wsUrl}/consultation`, {
      query: { practitionerId },
      transports: ['websocket', 'polling'],
      withCredentials: true
    });
    this.setupEventListeners();
  }
  private socket: Socket | null = null;
  private practitionerId: number | null = null;

  // Audio management properties
  private audioEnabled = true;
  private lastNotificationTime = 0;
  private notificationCooldown = 2000; // 2 seconds between audio alerts

  // State management
  private dashboardStateSubject = new BehaviorSubject<DashboardState>({
    isConnected: false,
    waitingPatientCount: 0,
    hasNewNotifications: false,
    lastNotificationTime: null
  });

  // Subjects for events
  public patientJoinedSubject = new Subject<WaitingRoomNotification>();
  public patientLeftSubject = new Subject<any>();
  public waitingRoomUpdateSubject = new Subject<any>();
  public practitionerPresenceSubject = new Subject<{ practitionerId: number; online: boolean }>();
  public fileUploadProgressSubject = new Subject<{ percent: number; fileId?: string }>();
  public fileUploadErrorSubject = new Subject<{ error: string; fileId?: string }>();

  // Public observables for external subscriptions
  public patientLeft$ = this.patientLeftSubject.asObservable();
  public waitingRoomUpdate$ = this.waitingRoomUpdateSubject.asObservable();

  constructor(
    private audioAlertService: AudioAlertService,
    private eventBus: EventBusService,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router
  ) {
    this.loadAudioSettings();
    this.initializeAudioPermission();
    this.dashboardState$ = this.dashboardStateSubject.asObservable();
    this.patientJoined$ = this.patientJoinedSubject.asObservable();
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Patient waiting events
    this.socket.on('patient_waiting', (data: any) => {
      // ...existing code...
      const notification: WaitingRoomNotification = {
        consultationId: data.consultationId || 0,
        patientFirstName: data.patientFirstName || 'Patient',
        patientInitials: this.generateInitials(data.patientFirstName),
        joinTime: new Date(data.joinTime || Date.now()),
        language: data.language,
        message: data.message || 'Patient is waiting in consultation room'
      };
      this.updateDashboardState({
        hasNewNotifications: true,
        waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
        lastNotificationTime: new Date()
      });
      this.patientJoinedSubject.next(notification);
      this.eventBus.emit('dashboard:patient_joined', notification);
      this.handlePatientJoinedAlert(notification);
    });

    // Canonical waiting room notification used for dashboard audio/UX
    this.socket.on('waiting_room_notification', (data: any) => {
      const notification: WaitingRoomNotification = {
        consultationId: data.consultationId || 0,
        patientFirstName: data.patientFirstName || 'Patient',
        patientInitials: data.patientInitials || this.generateInitials(data.patientFirstName),
        joinTime: new Date(data.joinTime || Date.now()),
        language: data.language || null,
        message: data.message || 'Patient is waiting in the consultation room',
      };
      this.updateDashboardState({
        hasNewNotifications: true,
        waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
        lastNotificationTime: new Date(),
      });
      this.patientJoinedSubject.next(notification);
      this.eventBus.emit('dashboard:patient_joined', notification);
      try {
        const toastMsg = `${notification.patientFirstName} is waiting` + (data.requestId ? ` (id: ${data.requestId})` : '');
        this.toastService.show(
          toastMsg,
          undefined,
          undefined,
          {
            label: 'Open',
            callback: () => {
              try {
                this.router.navigate(['/consultation-room', notification.consultationId], { queryParams: { practitionerId: this.practitionerId } });
              } catch (e) {
                console.error('Navigation from toast failed', e);
              }
            },
          },
        );
        this.eventBus.emit('dashboard:patient_actionable', {
          consultationId: notification.consultationId,
          patientFirstName: notification.patientFirstName,
          requestId: data.requestId ?? null,
          origin: data.origin ?? null,
        });
      } catch (e) {
        console.warn('[DashboardWebSocketService] Toast error:', e);
      }
      this.handlePatientJoinedAlert(notification);
    });

    // Enhanced patient joined waiting room event
    this.socket.on('patient_joined_waiting_room', (data: any) => {
      // ...existing code...
      const notification: WaitingRoomNotification = {
        consultationId: data.consultationId || 0,
        patientFirstName: data.patient?.name?.split(' ')[0] || 'Patient',
        patientInitials: this.generateInitials(data.patient?.name),
        joinTime: new Date(data.patient?.joinedAt || Date.now()),
        language: data.patient?.language,
        message: data.message || 'Patient has joined the waiting room'
      };
      this.updateDashboardState({
        hasNewNotifications: true,
        waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
        lastNotificationTime: new Date()
      });
      this.patientJoinedSubject.next(notification);
      this.eventBus.emit('dashboard:patient_joined', notification);
      this.handlePatientJoinedAlert(notification);
    });

    // Backwards-compatible focused patient joined event
    this.socket.on('patient_joined', (data: any) => {
      const notification: WaitingRoomNotification = {
        consultationId: data.consultationId || 0,
        patientFirstName: data.patientFirstName || data.patient?.name?.split(' ')[0] || 'Patient',
        patientInitials: this.generateInitials(data.patientFirstName || data.patient?.name),
        joinTime: new Date(data.joinTime || Date.now()),
        language: data.language || null,
        message: data.message || 'Patient joined and is waiting'
      };
      this.updateDashboardState({
        hasNewNotifications: true,
        waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
        lastNotificationTime: new Date(),
      });
      this.patientJoinedSubject.next(notification);
      this.eventBus.emit('dashboard:patient_joined', notification);
      try {
        const toastMsg = `${notification.patientFirstName} joined` + (data.requestId ? ` (id: ${data.requestId})` : '');
        this.toastService.show(
          toastMsg,
          undefined,
          undefined,
          {
            label: 'Open',
            callback: () => {
              try {
                this.router.navigate(['/consultation-room', notification.consultationId], { queryParams: { practitionerId: this.practitionerId } });
              } catch (e) {
                console.error('Navigation from toast failed', e);
              }
            },
          },
        );
        this.eventBus.emit('dashboard:patient_actionable', {
          consultationId: notification.consultationId,
          patientFirstName: notification.patientFirstName,
          requestId: data.requestId ?? null,
          origin: data.origin ?? null,
        });
      } catch (e) {
        console.warn('[DashboardWebSocketService] Toast error:', e);
      }
      this.handlePatientJoinedAlert(notification);
    });

    // Patient left events
    this.socket.on('patient_left_waiting_room', (data: any) => {
      this.updateDashboardState({
        waitingPatientCount: Math.max(0, this.dashboardStateSubject.value.waitingPatientCount - 1)
      });
      this.patientLeftSubject.next(data);
      this.eventBus.emit('dashboard:patient_left', data);
    });

    // Waiting room updates
    this.socket.on('waiting_room_update', (data: any) => {
      // ...existing code...
      this.updateDashboardState({
        waitingPatientCount: data.waitingCount || 0
      });
      this.waitingRoomUpdateSubject.next(data);
      this.eventBus.emit('dashboard:waiting_room_update', data);
    });

    // Notification when a consultation in waiting room has been assigned to a practitioner
    this.socket.on('waiting_room_consultation_assigned', (data: any) => {
      // ...existing code...
      this.updateDashboardState({
        hasNewNotifications: true,
        waitingPatientCount: Math.max(0, this.dashboardStateSubject.value.waitingPatientCount - 1),
        lastNotificationTime: new Date()
      });
      const notification: WaitingRoomNotification = {
        consultationId: data.consultationId || 0,
        patientFirstName: data.patient?.firstName || 'Patient',
        patientInitials: this.generateInitials(data.patient?.firstName),
        joinTime: new Date(),
        language: data.patient?.language,
        message: 'A waiting-room consultation has been assigned'
      };
      this.patientJoinedSubject.next(notification);
      this.handlePatientJoinedAlert(notification);
      this.eventBus.emit('dashboard:waiting_room_consultation_assigned', notification);
    });

    // Practitioner presence updates
    this.socket.on('practitioner_presence_update', (data: { practitionerId: number; online: boolean }) => {
      this.practitionerPresenceSubject.next(data);
      this.eventBus.emit('dashboard:practitioner_presence', data);
    });

    // Connection events
    this.socket.on('connect', () => {
      this.updateDashboardState({ isConnected: true });
      this.showToast('Connected to consultation dashboard.');
      this.socket?.emit('practitioner_online', { practitionerId: this.practitionerId });
    });

    this.socket.on('disconnect', () => {
      this.updateDashboardState({ isConnected: false });
      this.showToast('Disconnected from dashboard. Trying to reconnect...');
      this.socket?.emit('practitioner_offline', { practitionerId: this.practitionerId });
    });

    this.socket.on('reconnect', () => {
      this.showToast('Reconnected to dashboard. Session restored.');
      if (this.practitionerId) {
        this.socket?.emit('join_practitioner_room', { practitionerId: this.practitionerId });
      }
    });

    // Listen for session recovery events from backend
    this.socket.on('session_sync', () => {
      this.showToast('Session synchronized.');
    });
    this.socket.on('session_ended', () => {
      this.showToast('Session ended. Please rejoin the dashboard.');
    });

    // File upload events
    this.socket.on('file_upload_progress', (data: { percent: number; fileId?: string }) => {
      this.fileUploadProgressSubject.next(data);
      this.eventBus.emit('dashboard:file_upload_progress', data);
    });
    this.socket.on('file_upload_error', (data: { error: string; fileId?: string }) => {
      this.fileUploadErrorSubject.next(data);
      this.eventBus.emit('dashboard:file_upload_error', data);
    });
  }

  // ...existing code...

  // Event Handlers
  private handlePatientWaiting(data: any): void {
    const notification: WaitingRoomNotification = {
      consultationId: data.consultationId || 0,
      patientFirstName: data.patientFirstName || 'Patient',
      patientInitials: this.generateInitials(data.patientFirstName),
      joinTime: new Date(data.joinTime || Date.now()),
      language: data.language,
      message: data.message || 'Patient is waiting in consultation room'
    };
    this.updateDashboardState({
      hasNewNotifications: true,
      waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
      lastNotificationTime: new Date()
    });
    this.patientJoinedSubject.next(notification);
    this.eventBus.emit('dashboard:patient_joined', notification);
    this.handlePatientJoinedAlert(notification);
  }

  private handleWaitingRoomNotification(data: any): void {
    const notification: WaitingRoomNotification = {
      consultationId: data.consultationId || 0,
      patientFirstName: data.patientFirstName || 'Patient',
      patientInitials: data.patientInitials || this.generateInitials(data.patientFirstName),
      joinTime: new Date(data.joinTime || Date.now()),
      language: data.language || null,
      message: data.message || 'Patient is waiting in the consultation room',
    };
    this.updateDashboardState({
      hasNewNotifications: true,
      waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
      lastNotificationTime: new Date(),
    });
    this.patientJoinedSubject.next(notification);
    this.eventBus.emit('dashboard:patient_joined', notification);
    try {
      const toastMsg = `${notification.patientFirstName} is waiting` + (data.requestId ? ` (id: ${data.requestId})` : '');
      this.toastService.show(toastMsg, undefined, undefined, {
        label: 'Open',
        callback: () => {
          try {
            this.router.navigate(['/consultation-room', notification.consultationId], { queryParams: { practitionerId: this.practitionerId } });
          } catch (e) {
            console.error('Navigation from toast failed', e);
          }
        },
      });
      this.eventBus.emit('dashboard:patient_actionable', {
        consultationId: notification.consultationId,
        patientFirstName: notification.patientFirstName,
        requestId: data.requestId ?? null,
        origin: data.origin ?? null,
      });
    } catch (e) {
      console.warn('[DashboardWebSocketService] Toast error:', e);
    }
    this.handlePatientJoinedAlert(notification);
  }

  private handlePatientJoinedWaitingRoom(data: any): void {
    const notification: WaitingRoomNotification = {
      consultationId: data.consultationId || 0,
      patientFirstName: data.patient?.name?.split(' ')[0] || 'Patient',
      patientInitials: this.generateInitials(data.patient?.name),
      joinTime: new Date(data.patient?.joinedAt || Date.now()),
      language: data.patient?.language,
      message: data.message || 'Patient has joined the waiting room'
    };
    this.updateDashboardState({
      hasNewNotifications: true,
      waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
      lastNotificationTime: new Date()
    });
    this.patientJoinedSubject.next(notification);
    this.eventBus.emit('dashboard:patient_joined', notification);
    this.handlePatientJoinedAlert(notification);
  }

  private handlePatientJoined(data: any): void {
    const notification: WaitingRoomNotification = {
      consultationId: data.consultationId || 0,
      patientFirstName: data.patientFirstName || data.patient?.name?.split(' ')[0] || 'Patient',
      patientInitials: this.generateInitials(data.patientFirstName || data.patient?.name),
      joinTime: new Date(data.joinTime || Date.now()),
      language: data.language || null,
      message: data.message || 'Patient joined and is waiting'
    };
    this.updateDashboardState({
      hasNewNotifications: true,
      waitingPatientCount: this.dashboardStateSubject.value.waitingPatientCount + 1,
      lastNotificationTime: new Date(),
    });
    this.patientJoinedSubject.next(notification);
    this.eventBus.emit('dashboard:patient_joined', notification);
    try {
      const toastMsg = `${notification.patientFirstName} joined` + (data.requestId ? ` (id: ${data.requestId})` : '');
      this.toastService.show(toastMsg, undefined, undefined, {
        label: 'Open',
        callback: () => {
          try {
            this.router.navigate(['/consultation-room', notification.consultationId], { queryParams: { practitionerId: this.practitionerId } });
          } catch (e) {
            console.error('Navigation from toast failed', e);
          }
        },
      });
      this.eventBus.emit('dashboard:patient_actionable', {
        consultationId: notification.consultationId,
        patientFirstName: notification.patientFirstName,
        requestId: data.requestId ?? null,
        origin: data.origin ?? null,
      });
    } catch (e) {
      console.warn('[DashboardWebSocketService] Toast error:', e);
    }
    this.handlePatientJoinedAlert(notification);
  }

  private handlePatientLeftWaitingRoom(data: any): void {
    this.updateDashboardState({
      waitingPatientCount: Math.max(0, this.dashboardStateSubject.value.waitingPatientCount - 1)
    });
    this.patientLeftSubject.next(data);
    this.eventBus.emit('dashboard:patient_left', data);
  }

  private handleWaitingRoomUpdate(data: any): void {
    this.updateDashboardState({
      waitingPatientCount: data.waitingCount || 0
    });
    this.waitingRoomUpdateSubject.next(data);
    this.eventBus.emit('dashboard:waiting_room_update', data);
  }

  private handleConsultationAssigned(data: any): void {
    this.updateDashboardState({
      hasNewNotifications: true,
      waitingPatientCount: Math.max(0, this.dashboardStateSubject.value.waitingPatientCount - 1),
      lastNotificationTime: new Date()
    });
    const notification: WaitingRoomNotification = {
      consultationId: data.consultationId || 0,
      patientFirstName: data.patient?.firstName || 'Patient',
      patientInitials: this.generateInitials(data.patient?.firstName),
      joinTime: new Date(),
      language: data.patient?.language,
      message: 'A waiting-room consultation has been assigned'
    };
    this.patientJoinedSubject.next(notification);
    this.handlePatientJoinedAlert(notification);
    this.eventBus.emit('dashboard:waiting_room_consultation_assigned', notification);
  }

  // Helper for toast
  private showToast(message: string): void {
    if (message) {
      this.toastService.show(message, 4000, ToastType.INFO);
    }
  }

  /**
   * Mark notifications as read
   */
  markNotificationsAsRead(): void {
    this.updateDashboardState({ hasNewNotifications: false });
  }

  /**
   * Get current waiting patient count
   */
  getWaitingPatientCount(): number {
    return this.dashboardStateSubject.value.waitingPatientCount;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.dashboardStateSubject.value.isConnected;
  }

  /**
   * Disconnect dashboard WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.updateDashboardState({
      isConnected: false,
      waitingPatientCount: 0,
      hasNewNotifications: false,
      lastNotificationTime: null
    });
  }

  /**
   * Update dashboard state
   */
  private updateDashboardState(updates: Partial<DashboardState>): void {
    const currentState = this.dashboardStateSubject.value;
    this.dashboardStateSubject.next({ ...currentState, ...updates });
  }

  /**
   * Generate initials from patient name
   */
  private generateInitials(name?: string): string {
    if (!name) return 'P';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0][0]?.toUpperCase() || 'P';
  }

  /**
   * Handle audio alert when patient joins
   */
  private async handlePatientJoinedAlert(notification: WaitingRoomNotification): Promise<void> {
    if (!this.isAudioEnabled()) return;
    try {
      const now = Date.now();
      if (now - this.lastNotificationTime < this.notificationCooldown) {
        return;
      }
      this.lastNotificationTime = now;
      const waitingCount = this.dashboardStateSubject.value.waitingPatientCount;
      if (waitingCount > 3) {
        await this.audioAlertService.playUrgentAlert();
      } else if (waitingCount > 1) {
        await this.audioAlertService.playMultiplePatientAlert(waitingCount);
      } else {
        await this.audioAlertService.playPatientJoinedAlert();
      }
    } catch (error) {
      console.error('[DashboardWebSocketService] Failed to play audio alert:', error);
    }
  }

  /**
   * Emit file upload event to backend
   */
  uploadFile(file: File, consultationId: number): void {
    if (!this.socket) return;
    const reader = new FileReader();
    reader.onload = () => {
      const fileData = reader.result;
      this.socket?.emit('upload_file', {
        consultationId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData,
      });
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Initialize audio permission on user interaction
   */
  private async initializeAudioPermission(): Promise<void> {
    try {
      const hasPermission = await this.audioAlertService.requestAudioPermission();
      if (hasPermission) {
        // Audio alerts initialized
      }
    } catch (error) {
      console.error('[DashboardWebSocketService] Failed to initialize audio alerts:', error);
    }
  }

  /**
   * Load audio settings from localStorage
   */
  private loadAudioSettings(): void {
    try {
      const savedSettings = localStorage.getItem('dashboard_audio_settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        this.audioEnabled = settings.enabled !== false;
        this.notificationCooldown = settings.cooldown || 2000;
        this.audioAlertService.updateConfig({
          enabled: this.audioEnabled,
          volume: settings.volume || 0.7
        });
      }
    } catch (error) {
      console.error('[DashboardWebSocketService] Failed to load audio settings:', error);
    }
  }

  /**
   * Save audio settings to localStorage
   */
  private saveAudioSettings(): void {
    try {
      const settings = {
        enabled: this.audioEnabled,
        cooldown: this.notificationCooldown,
        volume: this.audioAlertService.getConfig().volume
      };
      localStorage.setItem('dashboard_audio_settings', JSON.stringify(settings));
    } catch (error) {
      console.error('[DashboardWebSocketService] Failed to save audio settings:', error);
    }
  }

  setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;
    this.audioAlertService.setEnabled(enabled);
    this.saveAudioSettings();
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  setAudioVolume(volume: number): void {
    this.audioAlertService.setVolume(volume);
    this.saveAudioSettings();
  }

  async testAudio(): Promise<boolean> {
    try {
      return await this.audioAlertService.testAudio();
    } catch (error) {
      return false;
    }
  }

  async playTestAlert(): Promise<void> {
    if (!this.isAudioEnabled()) return;
    try {
      await this.audioAlertService.playPatientJoinedAlert();
    } catch (error) {
    }
  }

  getAudioConfig() {
    return {
      enabled: this.audioEnabled,
      cooldown: this.notificationCooldown,
      volume: this.audioAlertService.getConfig().volume
    };
  }
}

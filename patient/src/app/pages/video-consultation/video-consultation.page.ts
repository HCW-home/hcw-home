import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonText,
  IonSpinner,
  IonAvatar,
  IonChip,
  NavController,
  AlertController,
  ToastController
} from '@ionic/angular/standalone';
import { Subject, interval, Subscription, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LocalVideoTrack, LocalTrack } from 'livekit-client';
import { TranslatePipe } from '@ngx-translate/core';

import { LiveKitService, ParticipantInfo, ConnectionStatus } from '../../core/services/livekit.service';
import { TranslationService } from '../../core/services/translation.service';
import { ConsultationService } from '../../core/services/consultation.service';
import { ConsultationWebSocketService } from '../../core/services/consultation-websocket.service';
import { AuthService } from '../../core/services/auth.service';
import { IncomingCallService } from '../../core/services/incoming-call.service';
import { User } from '../../core/models/consultation.model';
import { WebSocketState } from '../../core/models/websocket.model';
import { MessageListComponent, Message, SendMessageData, EditMessageData, DeleteMessageData } from '../../shared/components/message-list/message-list';
import { PreJoinLobbyComponent } from '../../shared/components/pre-join-lobby/pre-join-lobby.component';
import { IPreJoinSettings } from '../../core/models/media-device.model';

@Component({
  selector: 'app-video-consultation',
  templateUrl: './video-consultation.page.html',
  styleUrls: ['./video-consultation.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon,
    IonText,
    IonSpinner,
    IonAvatar,
    IonChip,
    MessageListComponent,
    PreJoinLobbyComponent,
    TranslatePipe
  ]
})
export class VideoConsultationPage implements OnInit, OnDestroy {
  private t = inject(TranslationService);

  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('localScreenShare') localScreenShareRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('participantsContainer') participantsContainerRef!: ElementRef<HTMLDivElement>;

  appointmentId: number | null = null;
  consultationId: number | null = null;

  connectionStatus: ConnectionStatus = 'disconnected';
  participants: Map<string, ParticipantInfo> = new Map();
  localVideoTrack: LocalVideoTrack | null = null;
  localScreenShareTrack: LocalTrack | null = null;

  isCameraEnabled = false;
  isMicrophoneEnabled = false;
  isScreenShareEnabled = false;
  isSpeakerOn = true;

  callDuration = 0;
  formattedDuration = '00:00';
  isLoading = false;
  errorMessage = '';

  showChat = signal(false);
  chatAvailable = signal(true);
  phase = signal<'lobby' | 'connecting' | 'in-call'>('lobby');
  messages = signal<Message[]>([]);
  isLoadingMore = signal(false);
  hasMore = signal(true);

  private destroy$ = new Subject<void>();
  private durationTimer: Subscription | null = null;
  private videoElements = new Map<string, HTMLVideoElement>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private screenShareElements = new Map<string, HTMLVideoElement>();

  private currentUser = signal<User | null>(null);
  private currentPage = 1;

  constructor(
    private route: ActivatedRoute,
    public navCtrl: NavController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private livekitService: LiveKitService,
    private consultationService: ConsultationService,
    private wsService: ConsultationWebSocketService,
    private authService: AuthService,
    private incomingCallService: IncomingCallService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const type = this.route.snapshot.queryParamMap.get('type');
    const appointmentIdParam = this.route.snapshot.queryParamMap.get('appointmentId');
    const consultationIdParam = this.route.snapshot.queryParamMap.get('consultationId');

    if (idParam) {
      const id = parseInt(idParam, 10);

      if (appointmentIdParam) {
        this.consultationId = id;
        this.appointmentId = parseInt(appointmentIdParam, 10);
      } else if (type === 'consultation') {
        this.consultationId = id;
      } else {
        this.appointmentId = id;
        if (consultationIdParam) {
          this.consultationId = parseInt(consultationIdParam, 10);
        }
      }
    }

    this.loadCurrentUser();
    this.setupSubscriptions();
    this.setupWebSocketSubscriptions();

    // Prevent tab/window close during video call
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  private loadCurrentUser(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        if (user) {
          this.currentUser.set(user as User);
        } else {
          this.authService.getCurrentUser().subscribe();
        }
      });
  }

  private setupWebSocketSubscriptions(): void {
    this.wsService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        const newMessage: Message = {
          id: event.data.id,
          username: event.data.username,
          message: event.data.message,
          timestamp: event.data.timestamp,
          isCurrentUser: false,
        };
        this.messages.update(msgs => [...msgs, newMessage]);
      });

    this.wsService.messageUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (!this.consultationId || event.consultation_id !== this.consultationId) {
          return;
        }

        if (event.state === 'created') {
          const exists = this.messages().some(m => m.id === event.data.id);
          if (!exists) {
            const user = this.currentUser();
            const isSystem = !event.data.created_by;
            const newMessage: Message = {
              id: event.data.id,
              username: isSystem ? '' : `${event.data.created_by.first_name} ${event.data.created_by.last_name}`,
              message: event.data.content,
              timestamp: event.data.created_at,
              isCurrentUser: isSystem ? false : user?.id === event.data.created_by.id,
              isSystem,
              attachment: event.data.attachment,
              isEdited: event.data.is_edited,
              updatedAt: event.data.updated_at,
            };
            this.messages.update(msgs => [...msgs, newMessage]);
          }
        } else if (event.state === 'updated' || event.state === 'deleted') {
          this.loadMessages();
        }
      });
  }

  private loadMessages(): void {
    if (!this.consultationId) return;

    this.currentPage = 1;
    this.consultationService.getConsultationMessagesPaginated(this.consultationId, 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const loadedMessages: Message[] = response.results.map(msg => {
            const isSystem = !msg.created_by;
            const isCurrentUser = isSystem ? false : msg.created_by.id === currentUserId;
            return {
              id: msg.id,
              username: isSystem ? '' : isCurrentUser ? this.t.instant('videoConsultation.you') : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim(),
              message: msg.content || '',
              timestamp: msg.created_at,
              isCurrentUser,
              isSystem,
              attachment: msg.attachment,
              isEdited: msg.is_edited,
              updatedAt: msg.updated_at,
              deletedAt: msg.deleted_at,
            };
          }).reverse();
          this.messages.set(loadedMessages);
        },
        error: (err) => {
          if (err?.status === 404) {
            this.chatAvailable.set(false);
          } else {
            this.showToast(this.t.instant('videoConsultation.failedLoadMessages'));
          }
        }
      });
  }

  private handleBeforeUnload = (event: BeforeUnloadEvent): string | undefined => {
    if (this.phase() === 'in-call') {
      console.log('[VideoConsultationPage] beforeunload - User is in call, showing confirmation dialog');
      // Prevent the page from closing without confirmation
      event.preventDefault();
      // Modern browsers ignore custom messages, but we still need to return a value
      return event.returnValue = '';
    }
    return undefined;
  };

  ngOnDestroy(): void {
    console.log('[VideoConsultationPage] ngOnDestroy called - cleaning up and disconnecting');
    this.destroy$.next();
    this.destroy$.complete();
    this.livekitService.disconnect();
    this.wsService.disconnect();
    this.cleanupMediaElements();
    this.stopDurationTimer();
    this.incomingCallService.clearActiveCall();
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  private setupSubscriptions(): void {
    this.livekitService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.connectionStatus = status;
        if (status === 'connected' && !this.durationTimer) {
          this.startDurationTimer();
        }
        this.cdr.markForCheck();
      });

    this.livekitService.localVideoTrack$
      .pipe(takeUntil(this.destroy$))
      .subscribe(track => {
        this.localVideoTrack = track;
        this.attachLocalVideo();
        this.cdr.markForCheck();
      });

    this.livekitService.participants$
      .pipe(takeUntil(this.destroy$))
      .subscribe(participants => {
        this.participants = participants;
        this.cdr.markForCheck();
        setTimeout(() => this.attachRemoteMedia(), 0);
      });

    this.livekitService.isCameraEnabled$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enabled => {
        this.isCameraEnabled = enabled;
        this.cdr.markForCheck();
      });

    this.livekitService.isMicrophoneEnabled$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enabled => {
        this.isMicrophoneEnabled = enabled;
        this.cdr.markForCheck();
      });

    this.livekitService.isScreenShareEnabled$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enabled => {
        this.isScreenShareEnabled = enabled;
        this.cdr.markForCheck();
      });

    this.livekitService.localScreenShareTrack$
      .pipe(takeUntil(this.destroy$))
      .subscribe(track => {
        this.localScreenShareTrack = track;
        this.cdr.markForCheck();
        setTimeout(() => this.attachLocalScreenShare(), 0);
      });

    this.livekitService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.errorMessage = error;
        this.showToast(error);
        this.cdr.markForCheck();
      });
  }

  async joinRoom(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    try {
      let config: { url: string; token: string; room: string } | undefined;

      if (this.appointmentId) {
        config = await this.consultationService
          .joinAppointment(this.appointmentId)
          .toPromise();
      } else if (this.consultationId) {
        config = await this.consultationService
          .joinConsultation(this.consultationId)
          .toPromise();
      } else {
        throw new Error('Either consultationId or appointmentId is required');
      }

      if (!config) {
        throw new Error('Failed to get LiveKit configuration');
      }

      await this.livekitService.connect(config);

      // Enable camera/microphone separately - don't fail the whole join if camera is unavailable
      try {
        await this.livekitService.enableCamera(true);
      } catch {
        // Camera not available, continue without it
      }
      try {
        await this.livekitService.enableMicrophone(true);
      } catch {
        // Microphone not available, continue without it
      }

      this.phase.set('in-call');
      if (this.appointmentId) {
        this.incomingCallService.setActiveCall(this.appointmentId);
      }
      this.showToast(this.t.instant('videoConsultation.connectedToConsultation'));

      if (this.consultationId) {
        this.loadMessages();
        this.wsService.connect(this.consultationId);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : this.t.instant('videoConsultation.failedJoin');
      this.showToast(this.errorMessage);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  onLobbyClose(): void {
    this.navCtrl.back();
  }

  async onJoinFromLobby(settings: IPreJoinSettings): Promise<void> {
    this.phase.set('connecting');
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    try {
      let config: { url: string; token: string; room: string } | undefined;

      if (this.appointmentId) {
        config = await this.consultationService
          .joinAppointment(this.appointmentId)
          .toPromise();
      } else if (this.consultationId) {
        config = await this.consultationService
          .joinConsultation(this.consultationId)
          .toPromise();
      } else {
        throw new Error('Either consultationId or appointmentId is required');
      }

      if (!config) {
        throw new Error('Failed to get LiveKit configuration');
      }

      const deviceIds: { camera?: string; microphone?: string } = {};
      if (settings.cameraDeviceId) {
        deviceIds.camera = settings.cameraDeviceId;
      }
      if (settings.microphoneDeviceId) {
        deviceIds.microphone = settings.microphoneDeviceId;
      }

      await this.livekitService.connect(config, undefined, deviceIds);

      // Enable camera/microphone separately - don't fail the whole join if camera is unavailable
      try {
        await this.livekitService.enableCamera(settings.cameraEnabled);
      } catch {
        // Camera not available, continue without it
      }
      try {
        await this.livekitService.enableMicrophone(settings.microphoneEnabled);
      } catch {
        // Microphone not available, continue without it
      }

      if (settings.speakerDeviceId) {
        await this.livekitService.switchSpeaker(settings.speakerDeviceId);
      }

      this.phase.set('in-call');
      if (this.appointmentId) {
        this.incomingCallService.setActiveCall(this.appointmentId);
      }
      this.cdr.markForCheck();
      setTimeout(() => {
        this.attachLocalVideo();
        this.attachRemoteMedia();
      });
      this.showToast(this.t.instant('videoConsultation.connectedToConsultation'));

      if (this.consultationId) {
        this.loadMessages();
        this.wsService.connect(this.consultationId);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : this.t.instant('videoConsultation.failedJoin');
      this.showToast(this.errorMessage);
      this.phase.set('lobby');
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private attachLocalVideo(): void {
    if (!this.localVideoRef?.nativeElement || !this.localVideoTrack) return;
    this.localVideoTrack.attach(this.localVideoRef.nativeElement);
  }

  private attachLocalScreenShare(): void {
    if (!this.localScreenShareRef?.nativeElement || !this.localScreenShareTrack) return;
    this.localScreenShareTrack.attach(this.localScreenShareRef.nativeElement);
  }

  private attachRemoteMedia(): void {
    if (!this.participantsContainerRef?.nativeElement) return;

    const currentParticipantIds = new Set(this.participants.keys());
    const existingElementIds = new Set(this.videoElements.keys());

    for (const id of existingElementIds) {
      if (!currentParticipantIds.has(id)) {
        this.removeParticipantElements(id);
      }
    }

    for (const [identity, participant] of this.participants) {
      this.attachParticipantMedia(identity, participant);
    }
  }

  private attachParticipantMedia(identity: string, participant: ParticipantInfo): void {
    if (participant.videoTrack) {
      let videoEl = this.videoElements.get(identity);
      if (!videoEl) {
        const templateEl = document.getElementById(`video-${identity}`) as HTMLVideoElement;
        if (templateEl) {
          videoEl = templateEl;
          this.videoElements.set(identity, videoEl);
        }
      }

      if (videoEl && participant.videoTrack.attachedElements.indexOf(videoEl) === -1) {
        participant.videoTrack.attach(videoEl);
      }
    }

    if (participant.audioTrack) {
      let audioEl = this.audioElements.get(identity);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.id = `audio-${identity}`;
        this.audioElements.set(identity, audioEl);
        document.body.appendChild(audioEl);
      }

      audioEl.muted = !this.isSpeakerOn;

      if (participant.audioTrack.attachedElements.indexOf(audioEl) === -1) {
        participant.audioTrack.attach(audioEl);
      }
    }

    if (participant.screenShareTrack) {
      let screenEl = this.screenShareElements.get(identity);
      if (!screenEl) {
        const templateEl = document.getElementById(`screen-${identity}`) as HTMLVideoElement;
        if (templateEl) {
          screenEl = templateEl;
          this.screenShareElements.set(identity, screenEl);
        }
      }

      if (screenEl && participant.screenShareTrack.attachedElements.indexOf(screenEl) === -1) {
        participant.screenShareTrack.attach(screenEl);
      }
    } else {
      const screenEl = this.screenShareElements.get(identity);
      if (screenEl) {
        screenEl.srcObject = null;
        this.screenShareElements.delete(identity);
      }
    }
  }

  private removeParticipantElements(identity: string): void {
    const videoEl = this.videoElements.get(identity);
    if (videoEl) {
      videoEl.srcObject = null;
      this.videoElements.delete(identity);
    }

    const audioEl = this.audioElements.get(identity);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      this.audioElements.delete(identity);
    }

    const screenEl = this.screenShareElements.get(identity);
    if (screenEl) {
      screenEl.srcObject = null;
      this.screenShareElements.delete(identity);
    }
  }

  private cleanupMediaElements(): void {
    for (const [identity] of this.videoElements) {
      this.removeParticipantElements(identity);
    }
    this.videoElements.clear();
    this.audioElements.clear();
    this.screenShareElements.clear();
  }

  private startDurationTimer(): void {
    this.durationTimer = interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.callDuration++;
        this.formattedDuration = this.formatDuration(this.callDuration);
        this.cdr.markForCheck();
      });
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) {
      this.durationTimer.unsubscribe();
      this.durationTimer = null;
    }
  }

  private formatDuration(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async toggleCamera(): Promise<void> {
    try {
      await this.livekitService.toggleCamera();
    } catch (error) {
      this.showToast(this.t.instant('videoConsultation.failedToggleCamera'));
    }
  }

  async toggleMicrophone(): Promise<void> {
    try {
      await this.livekitService.toggleMicrophone();
    } catch (error) {
      this.showToast(this.t.instant('videoConsultation.failedToggleMic'));
    }
  }

  toggleSpeaker(): void {
    this.isSpeakerOn = !this.isSpeakerOn;
    for (const audioEl of this.audioElements.values()) {
      audioEl.muted = !this.isSpeakerOn;
    }
  }

  async toggleScreenShare(): Promise<void> {
    try {
      await this.livekitService.toggleScreenShare();
    } catch (error) {
      this.showToast(this.t.instant('videoConsultation.failedToggleScreen'));
    }
  }

  switchCamera(): void {
    this.showToast(this.t.instant('videoConsultation.switchingCamera'));
  }

  async endCall(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: this.t.instant('videoConsultation.endCallHeader'),
      message: this.t.instant('videoConsultation.endCallMessage'),
      buttons: [
        {
          text: this.t.instant('common.cancel'),
          role: 'cancel'
        },
        {
          text: this.t.instant('videoConsultation.endCallButton'),
          role: 'destructive',
          handler: () => {
            this.performEndCall();
          }
        }
      ]
    });

    await alert.present();
  }

  private async performEndCall(): Promise<void> {
    this.phase.set('lobby'); // Prevent the guard from triggering on navigation

    // Notifier le backend du départ
    if (this.appointmentId) {
      try {
        await firstValueFrom(
          this.consultationService.leaveAppointment(this.appointmentId)
        );
      } catch (error) {
        console.error('Failed to notify leave:', error);
        // Continuer la déconnexion même en cas d'erreur
      }
    }

    await this.livekitService.disconnect();
    this.stopDurationTimer();
    this.incomingCallService.clearActiveCall();

    // Navigate to home page
    this.navCtrl.navigateRoot('/home');
  }

  openChat(): void {
    this.showChat.update(v => !v);
  }

  onSendMessage(data: SendMessageData): void {
    if (!this.consultationId) return;

    const tempId = Date.now();
    const newMessage: Message = {
      id: tempId,
      username: this.t.instant('videoConsultation.you'),
      message: data.content || '',
      timestamp: new Date().toISOString(),
      isCurrentUser: true,
      attachment: data.attachment ? { file_name: data.attachment.name, mime_type: data.attachment.type } : null,
    };
    this.messages.update(msgs => [...msgs, newMessage]);

    this.consultationService.sendConsultationMessage(this.consultationId, data.content || '', data.attachment)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (savedMessage) => {
          this.messages.update(msgs =>
            msgs.map(m => m.id === tempId ? {
              ...m,
              id: savedMessage.id,
              attachment: savedMessage.attachment
            } : m)
          );
        },
        error: () => {
          this.messages.update(msgs => msgs.filter(m => m.id !== tempId));
          this.showToast(this.t.instant('videoConsultation.failedSend'));
        }
      });
  }

  onEditMessage(data: EditMessageData): void {
    if (!this.consultationId) return;

    this.consultationService.updateConsultationMessage(data.messageId, data.content)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedMessage) => {
          this.messages.update(msgs =>
            msgs.map(m => m.id === data.messageId ? {
              ...m,
              message: updatedMessage.content || '',
              isEdited: updatedMessage.is_edited,
              updatedAt: updatedMessage.updated_at,
            } : m)
          );
          this.showToast(this.t.instant('videoConsultation.messageUpdated'));
        },
        error: () => {
          this.showToast(this.t.instant('videoConsultation.failedUpdate'));
        }
      });
  }

  onDeleteMessage(data: DeleteMessageData): void {
    this.consultationService.deleteConsultationMessage(data.messageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (deletedMessage) => {
          this.messages.update(msgs =>
            msgs.map(m => m.id === data.messageId ? {
              ...m,
              message: '',
              attachment: null,
              deletedAt: deletedMessage.deleted_at,
            } : m)
          );
          this.showToast(this.t.instant('videoConsultation.messageDeleted'));
        },
        error: () => {
          this.showToast(this.t.instant('videoConsultation.failedDelete'));
        }
      });
  }

  onLoadMore(): void {
    if (!this.consultationId || this.isLoadingMore() || !this.hasMore()) return;

    this.isLoadingMore.set(true);
    this.currentPage++;

    this.consultationService.getConsultationMessagesPaginated(this.consultationId, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.hasMore.set(!!response.next);
          const currentUserId = this.currentUser()?.pk;
          const olderMessages: Message[] = response.results.map(msg => {
            const isSystem = !msg.created_by;
            const isCurrentUser = isSystem ? false : msg.created_by.id === currentUserId;
            return {
              id: msg.id,
              username: isSystem ? '' : isCurrentUser ? this.t.instant('videoConsultation.you') : `${msg.created_by.first_name} ${msg.created_by.last_name}`.trim(),
              message: msg.content || '',
              timestamp: msg.created_at,
              isCurrentUser,
              isSystem,
              attachment: msg.attachment,
              isEdited: msg.is_edited,
              updatedAt: msg.updated_at,
              deletedAt: msg.deleted_at,
            };
          }).reverse();
          this.messages.update(msgs => [...olderMessages, ...msgs]);
          this.isLoadingMore.set(false);
        },
        error: () => {
          this.currentPage--;
          this.isLoadingMore.set(false);
          this.showToast(this.t.instant('videoConsultation.failedLoadMore'));
        }
      });
  }

  async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'top'
    });
    toast.present();
  }

  getCallStateMessage(): string {
    switch (this.connectionStatus) {
      case 'connecting': return this.t.instant('videoConsultation.connecting');
      case 'reconnecting': return this.t.instant('videoConsultation.reconnecting');
      case 'disconnected': return this.t.instant('videoConsultation.disconnected');
      case 'failed': return this.t.instant('videoConsultation.connectionFailedStatus');
      default: return '';
    }
  }

  getParticipantsArray(): ParticipantInfo[] {
    return Array.from(this.participants.values());
  }

  getRemoteParticipant(): ParticipantInfo | null {
    const participantsArray = this.getParticipantsArray();
    return participantsArray.length > 0 ? participantsArray[0] : null;
  }

  getParticipantVideoElement(identity: string): HTMLVideoElement | undefined {
    return this.videoElements.get(identity);
  }

  getTotalTileCount(): number {
    const participants = this.getParticipantsArray();
    const participantCount = participants.length;
    const screenShareCount = participants.filter(p => p.isScreenShareEnabled && p.screenShareTrack).length;
    const localScreenShareCount = this.isScreenShareEnabled && this.localScreenShareTrack ? 1 : 0;
    return 1 + localScreenShareCount + (participantCount > 0 ? participantCount + screenShareCount : 1);
  }

  getScreenSharingParticipant(): ParticipantInfo | null {
    for (const participant of this.participants.values()) {
      if (participant.isScreenShareEnabled && participant.screenShareTrack) {
        return participant;
      }
    }
    return null;
  }

  hasActiveScreenShare(): boolean {
    return this.getScreenSharingParticipant() !== null;
  }
}

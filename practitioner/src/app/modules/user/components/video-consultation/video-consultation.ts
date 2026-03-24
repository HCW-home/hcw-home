import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LocalVideoTrack, LocalTrack } from 'livekit-client';

import { LiveKitService, ParticipantInfo, ConnectionStatus } from '../../../../core/services/livekit.service';
import { MediaDeviceService } from '../../../../core/services/media-device.service';
import { ConsultationService } from '../../../../core/services/consultation.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { IncomingCallService } from '../../../../core/services/incoming-call.service';
import { ConfirmationService } from '../../../../core/services/confirmation.service';
import { IPreJoinSettings, IMediaDevices } from '../../../../core/models/media-device';
import { Button } from '../../../../shared/ui-components/button/button';
import { Svg } from '../../../../shared/ui-components/svg/svg';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { Loader } from '../../../../shared/components/loader/loader';
import { PreJoinLobby } from '../../../../shared/components/pre-join-lobby/pre-join-lobby';
import { MessageList, Message, SendMessageData, EditMessageData, DeleteMessageData } from '../../../../shared/components/message-list/message-list';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { ButtonStyleEnum } from '../../../../shared/constants/button';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-video-consultation',
  standalone: true,
  imports: [
    CommonModule,
    Button,
    Svg,
    Typography,
    Loader,
    MessageList,
    PreJoinLobby,
    TranslatePipe,
  ],
  templateUrl: './video-consultation.html',
  styleUrls: ['./video-consultation.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoConsultationComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() appointmentId?: number;
  @Input() consultationId?: number;
  @Input() livekitConfig?: { url: string; token: string; room: string };
  @Input() isMinimized = false;
  @Input() messages: Message[] = [];
  @Input() isLoadingMore = false;
  @Input() hasMore = true;
  @Output() leave = new EventEmitter<void>();
  @Output() toggleSize = new EventEmitter<void>();
  @Output() sendMessage = new EventEmitter<SendMessageData>();
  @Output() editMessage = new EventEmitter<EditMessageData>();
  @Output() deleteMessage = new EventEmitter<DeleteMessageData>();
  @Output() loadMore = new EventEmitter<void>();

  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('localScreenShare') localScreenShareRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('participantsContainer') participantsContainerRef!: ElementRef<HTMLDivElement>;

  connectionStatus: ConnectionStatus = 'disconnected';
  participants: Map<string, ParticipantInfo> = new Map();
  localVideoTrack: LocalVideoTrack | null = null;
  localScreenShareTrack: LocalTrack | null = null;
  isCameraEnabled = false;
  isMicrophoneEnabled = false;
  isScreenShareEnabled = false;
  isRecording = false;
  isLoading = false;
  errorMessage = '';
  showChat = signal(false);
  phase = signal<'lobby' | 'connecting' | 'in-call'>('lobby');

  devices: IMediaDevices = { cameras: [], microphones: [], speakers: [] };
  showMicMenu = false;
  showCameraMenu = false;
  activeMicId = '';
  activeCameraId = '';

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;

  private destroy$ = new Subject<void>();
  private videoElements = new Map<string, HTMLVideoElement>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private screenShareElements = new Map<string, HTMLVideoElement>();

  private t: TranslationService;

  constructor(
    private livekitService: LiveKitService,
    private mediaDeviceService: MediaDeviceService,
    private consultationService: ConsultationService,
    private toasterService: ToasterService,
    private incomingCallService: IncomingCallService,
    private confirmationService: ConfirmationService,
    private cdr: ChangeDetectorRef,
    translationService: TranslationService
  ) {
    this.t = translationService;
  }

  ngOnInit(): void {
    this.setupSubscriptions();
  }

  ngAfterViewInit(): void {
  }

  ngOnDestroy(): void {
    console.log('[VideoConsultation] ngOnDestroy called - cleaning up and disconnecting');
    this.destroy$.next();
    this.destroy$.complete();
    this.livekitService.disconnect();
    this.cleanupMediaElements();
  }

  private setupSubscriptions(): void {
    this.livekitService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.connectionStatus = status;
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
        this.toasterService.show('error', this.t.instant('videoConsultation.error'), error);
        this.cdr.markForCheck();
      });
  }

  private async joinRoom(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    try {
      const config = await this.getCallConfig();

      if (!config) {
        throw new Error(this.t.instant('videoConsultation.failedLivekitConfig'));
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
    } catch (error: any) {
      this.errorMessage = getErrorMessage(error)
      this.toasterService.show('error', this.t.instant('videoConsultation.connectionError'), this.errorMessage);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async getCallConfig(): Promise<{ url: string; token: string; room: string } | undefined> {
    if (this.livekitConfig) {
      return this.livekitConfig;
    }
    if (this.appointmentId) {
      return this.consultationService.joinAppointment(this.appointmentId).toPromise();
    }
    if (this.consultationId) {
      return this.consultationService.joinConsultation(this.consultationId).toPromise();
    }
    throw new Error(this.t.instant('videoConsultation.appointmentRequired'));
  }

  onLobbyClose(): void {
    this.leave.emit();
  }

  async onJoinFromLobby(settings: IPreJoinSettings): Promise<void> {
    this.phase.set('connecting');
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    try {
      const config = await this.getCallConfig();

      if (!config) {
        throw new Error(this.t.instant('videoConsultation.failedLivekitConfig'));
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
      this.activeCameraId = settings.cameraDeviceId || '';
      this.activeMicId = settings.microphoneDeviceId || '';
      await this.loadDevices();
      this.cdr.markForCheck();
      setTimeout(() => {
        this.attachLocalVideo();
        this.attachRemoteMedia();
      });
    } catch (error: any) {
      this.errorMessage = getErrorMessage(error);
      this.toasterService.show('error', this.t.instant('videoConsultation.connectionError'), this.errorMessage);
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
      videoEl.remove();
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

  async toggleCamera(): Promise<void> {
    try {
      await this.livekitService.toggleCamera();
    } catch (error) {
      this.toasterService.show('error', this.t.instant('videoConsultation.cameraError'), this.t.instant('videoConsultation.failedToggleCamera'));
    }
  }

  async toggleMicrophone(): Promise<void> {
    try {
      await this.livekitService.toggleMicrophone();
    } catch (error) {
      this.toasterService.show('error', this.t.instant('videoConsultation.microphoneError'), this.t.instant('videoConsultation.failedToggleMicrophone'));
    }
  }

  async loadDevices(): Promise<void> {
    this.devices = await this.mediaDeviceService.enumerateDevices();
  }

  toggleMicMenu(): void {
    this.showMicMenu = !this.showMicMenu;
    this.showCameraMenu = false;
  }

  toggleCameraMenu(): void {
    this.showCameraMenu = !this.showCameraMenu;
    this.showMicMenu = false;
  }

  closeDeviceMenus(): void {
    this.showMicMenu = false;
    this.showCameraMenu = false;
  }

  async switchMicrophone(deviceId: string): Promise<void> {
    try {
      await this.livekitService.switchMicrophone(deviceId);
      this.activeMicId = deviceId;
      this.showMicMenu = false;
      this.cdr.markForCheck();
    } catch (error) {
      this.toasterService.show('error', this.t.instant('videoConsultation.microphoneError'), this.t.instant('videoConsultation.failedToggleMicrophone'));
    }
  }

  async switchCamera(deviceId: string): Promise<void> {
    try {
      await this.livekitService.switchCamera(deviceId);
      this.activeCameraId = deviceId;
      this.showCameraMenu = false;
      this.cdr.markForCheck();
    } catch (error) {
      this.toasterService.show('error', this.t.instant('videoConsultation.cameraError'), this.t.instant('videoConsultation.failedToggleCamera'));
    }
  }

  async toggleScreenShare(): Promise<void> {
    try {
      await this.livekitService.toggleScreenShare();
    } catch (error) {
      this.toasterService.show('error', this.t.instant('videoConsultation.screenShareError'), this.t.instant('videoConsultation.failedToggleScreenShare'));
    }
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    if (!this.appointmentId) {
      this.toasterService.show('error', this.t.instant('videoConsultation.recordingError'), this.t.instant('videoConsultation.noAppointmentId'));
      return;
    }

    try {
      await this.consultationService.startRecording(this.appointmentId).toPromise();
      this.isRecording = true;
      this.cdr.markForCheck();
      this.toasterService.show('success', this.t.instant('videoConsultation.recordingStarted'), this.t.instant('videoConsultation.recordingStartedMessage'));
    } catch (error) {
      this.toasterService.show('error', this.t.instant('videoConsultation.recordingError'), this.t.instant('videoConsultation.failedStartRecording'));
    }
  }

  private async stopRecording(): Promise<void> {
    if (!this.appointmentId) {
      this.toasterService.show('error', this.t.instant('videoConsultation.recordingError'), this.t.instant('videoConsultation.noAppointmentId'));
      return;
    }

    try {
      await this.consultationService.stopRecording(this.appointmentId).toPromise();
      this.isRecording = false;
      this.cdr.markForCheck();
      this.toasterService.show('success', this.t.instant('videoConsultation.recordingStopped'), this.t.instant('videoConsultation.recordingStoppedMessage'));
    } catch (error) {
      this.toasterService.show('error', this.t.instant('videoConsultation.recordingError'), this.t.instant('videoConsultation.failedStopRecording'));
    }
  }

  async leaveCall(): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: this.t.instant('videoCall.leaveCallTitle'),
      message: this.t.instant('videoCall.leaveCallMessage'),
      confirmText: this.t.instant('videoCall.leaveCallConfirm'),
      cancelText: this.t.instant('videoCall.leaveCallCancel'),
      confirmStyle: 'danger',
    });

    if (confirmed) {
      // Notifier le backend du départ
      if (this.appointmentId) {
        try {
          await firstValueFrom(
            this.consultationService.leaveAppointment(this.appointmentId)
          );
        } catch (error) {
          console.error('Failed to notify leave:', error);
        }
      }

      await this.livekitService.disconnect();
      this.leave.emit();
    }
  }

  onToggleSize(): void {
    this.toggleSize.emit();
  }

  toggleChatPanel(): void {
    this.showChat.update(v => !v);
  }

  onSendMessage(data: SendMessageData): void {
    this.sendMessage.emit(data);
  }

  onEditMessage(data: EditMessageData): void {
    this.editMessage.emit(data);
  }

  onDeleteMessage(data: DeleteMessageData): void {
    this.deleteMessage.emit(data);
  }

  onLoadMore(): void {
    this.loadMore.emit();
  }

  getParticipantsArray(): ParticipantInfo[] {
    return Array.from(this.participants.values());
  }

  getParticipantVideoElement(identity: string): HTMLVideoElement | undefined {
    return this.videoElements.get(identity);
  }

  trackByIdentity(index: number, participant: ParticipantInfo): string {
    return participant.identity;
  }

  getTotalTileCount(): number {
    const participants = this.getParticipantsArray();
    const screenShareCount = participants.filter(p => p.isScreenShareEnabled && p.screenShareTrack).length;
    const localScreenShareCount = this.isScreenShareEnabled && this.localScreenShareTrack ? 1 : 0;
    return 1 + localScreenShareCount + this.participants.size + screenShareCount + (this.participants.size === 0 ? 1 : 0);
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

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  LocalAudioTrack,
  LocalTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  ConnectionState,
  DisconnectReason,
  RoomOptions,
  Participant,
} from 'livekit-client';

export interface LiveKitConfig {
  url: string;
  room: string;
  token: string;
}

export interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isScreenShareEnabled: boolean;
  videoTrack: RemoteTrack | null;
  audioTrack: RemoteTrack | null;
  screenShareTrack: RemoteTrack | null;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

@Injectable({
  providedIn: 'root',
})
export class LiveKitService implements OnDestroy {
  private room: Room | null = null;
  private destroy$ = new Subject<void>();

  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>('disconnected');
  private localVideoTrackSubject = new BehaviorSubject<LocalVideoTrack | null>(null);
  private localAudioTrackSubject = new BehaviorSubject<LocalAudioTrack | null>(null);
  private localScreenShareTrackSubject = new BehaviorSubject<LocalTrack | null>(null);
  private participantsSubject = new BehaviorSubject<Map<string, ParticipantInfo>>(new Map());
  private isCameraEnabledSubject = new BehaviorSubject<boolean>(false);
  private isMicrophoneEnabledSubject = new BehaviorSubject<boolean>(false);
  private isScreenShareEnabledSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new Subject<string>();

  public connectionStatus$: Observable<ConnectionStatus> = this.connectionStatusSubject.asObservable();
  public localVideoTrack$: Observable<LocalVideoTrack | null> = this.localVideoTrackSubject.asObservable();
  public localAudioTrack$: Observable<LocalAudioTrack | null> = this.localAudioTrackSubject.asObservable();
  public localScreenShareTrack$: Observable<LocalTrack | null> = this.localScreenShareTrackSubject.asObservable();
  public participants$: Observable<Map<string, ParticipantInfo>> = this.participantsSubject.asObservable();
  public isCameraEnabled$: Observable<boolean> = this.isCameraEnabledSubject.asObservable();
  public isMicrophoneEnabled$: Observable<boolean> = this.isMicrophoneEnabledSubject.asObservable();
  public isScreenShareEnabled$: Observable<boolean> = this.isScreenShareEnabledSubject.asObservable();
  public error$: Observable<string> = this.errorSubject.asObservable();

  async connect(
    config: LiveKitConfig,
    options?: Partial<RoomOptions>,
    deviceIds?: { camera?: string; microphone?: string }
  ): Promise<void> {
    if (this.room) {
      await this.disconnect();
    }

    this.connectionStatusSubject.next('connecting');

    try {
      const roomOptions: RoomOptions = {
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: false, // Don't auto-disconnect, let our beforeunload handler manage it
        publishDefaults: {
          videoCodec: 'vp9',
        },
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720 },
          ...(deviceIds?.camera ? { deviceId: deviceIds.camera } : {}),
        },
        audioCaptureDefaults: {
          ...(deviceIds?.microphone ? { deviceId: deviceIds.microphone } : {}),
        },
        ...options,
      };

      this.room = new Room(roomOptions);
      this.setupRoomEventListeners();

      await this.room.connect(config.url, config.token, {
        autoSubscribe: true,
      });

      this.connectionStatusSubject.next('connected');
      this.updateParticipants();
    } catch (error) {
      this.connectionStatusSubject.next('failed');
      this.errorSubject.next(error instanceof Error ? error.message : 'Failed to connect to room');
      throw error;
    }
  }

  private setupRoomEventListeners(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      switch (state) {
        case ConnectionState.Connected:
          this.connectionStatusSubject.next('connected');
          break;
        case ConnectionState.Reconnecting:
          this.connectionStatusSubject.next('reconnecting');
          break;
        case ConnectionState.Disconnected:
          this.connectionStatusSubject.next('disconnected');
          break;
      }
    });

    this.room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      this.connectionStatusSubject.next('disconnected');
      this.cleanup();
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this.updateParticipants();
    });

    this.room.on(RoomEvent.LocalTrackPublished, () => {
      this.updateLocalTrackStates();
    });

    this.room.on(RoomEvent.LocalTrackUnpublished, () => {
      this.updateLocalTrackStates();
    });

    this.room.on(RoomEvent.MediaDevicesError, (error: Error) => {
      this.errorSubject.next(`Media device error: ${error.message}`);
    });
  }

  private updateParticipants(): void {
    if (!this.room) return;

    const participants = new Map<string, ParticipantInfo>();

    for (const participant of this.room.remoteParticipants.values()) {
      const videoPublication = participant.getTrackPublication(Track.Source.Camera);
      const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
      const screenSharePublication = participant.getTrackPublication(Track.Source.ScreenShare);

      participants.set(participant.identity, {
        identity: participant.identity,
        name: participant.name || participant.identity,
        isSpeaking: participant.isSpeaking,
        isCameraEnabled: videoPublication?.isSubscribed && !videoPublication.isMuted || false,
        isMicrophoneEnabled: audioPublication?.isSubscribed && !audioPublication.isMuted || false,
        isScreenShareEnabled: screenSharePublication?.isSubscribed || false,
        videoTrack: videoPublication?.track || null,
        audioTrack: audioPublication?.track || null,
        screenShareTrack: screenSharePublication?.track || null,
      });
    }

    this.participantsSubject.next(participants);
  }

  private updateLocalTrackStates(): void {
    if (!this.room?.localParticipant) return;

    const cameraPublication = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
    const microphonePublication = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const screenSharePublication = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare);

    this.isCameraEnabledSubject.next(!!cameraPublication?.track && !cameraPublication.isMuted);
    this.isMicrophoneEnabledSubject.next(!!microphonePublication?.track && !microphonePublication.isMuted);
    this.isScreenShareEnabledSubject.next(!!screenSharePublication?.track);

    if (cameraPublication?.track) {
      this.localVideoTrackSubject.next(cameraPublication.track as LocalVideoTrack);
    } else {
      this.localVideoTrackSubject.next(null);
    }

    if (microphonePublication?.track) {
      this.localAudioTrackSubject.next(microphonePublication.track as LocalAudioTrack);
    } else {
      this.localAudioTrackSubject.next(null);
    }

    if (screenSharePublication?.track) {
      this.localScreenShareTrackSubject.next(screenSharePublication.track as LocalTrack);
    } else {
      this.localScreenShareTrackSubject.next(null);
    }
  }

  async enableCamera(enable: boolean = true): Promise<void> {
    if (!this.room?.localParticipant) {
      this.errorSubject.next('Not connected to room');
      return;
    }

    try {
      await this.room.localParticipant.setCameraEnabled(enable);
      this.updateLocalTrackStates();
    } catch (error) {
      this.errorSubject.next(error instanceof Error ? error.message : 'Failed to toggle camera');
      throw error;
    }
  }

  async enableMicrophone(enable: boolean = true): Promise<void> {
    if (!this.room?.localParticipant) {
      this.errorSubject.next('Not connected to room');
      return;
    }

    try {
      await this.room.localParticipant.setMicrophoneEnabled(enable);
      this.updateLocalTrackStates();
    } catch (error) {
      this.errorSubject.next(error instanceof Error ? error.message : 'Failed to toggle microphone');
      throw error;
    }
  }

  async toggleCamera(): Promise<void> {
    await this.enableCamera(!this.isCameraEnabledSubject.value);
  }

  async toggleMicrophone(): Promise<void> {
    await this.enableMicrophone(!this.isMicrophoneEnabledSubject.value);
  }

  async startScreenShare(): Promise<void> {
    if (!this.room?.localParticipant) {
      this.errorSubject.next('Not connected to room');
      return;
    }

    try {
      await this.room.localParticipant.setScreenShareEnabled(true);
      this.isScreenShareEnabledSubject.next(true);
    } catch (error) {
      this.errorSubject.next(error instanceof Error ? error.message : 'Failed to start screen share');
      throw error;
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.room?.localParticipant) {
      this.errorSubject.next('Not connected to room');
      return;
    }

    try {
      await this.room.localParticipant.setScreenShareEnabled(false);
      this.isScreenShareEnabledSubject.next(false);
    } catch (error) {
      this.errorSubject.next(error instanceof Error ? error.message : 'Failed to stop screen share');
      throw error;
    }
  }

  async toggleScreenShare(): Promise<void> {
    if (this.isScreenShareEnabledSubject.value) {
      await this.stopScreenShare();
    } else {
      await this.startScreenShare();
    }
  }

  async switchCamera(deviceId: string): Promise<void> {
    if (!this.room) return;
    await this.room.switchActiveDevice('videoinput', deviceId);
  }

  async switchMicrophone(deviceId: string): Promise<void> {
    if (!this.room) return;
    await this.room.switchActiveDevice('audioinput', deviceId);
  }

  async switchSpeaker(deviceId: string): Promise<void> {
    if (!this.room) return;
    await this.room.switchActiveDevice('audiooutput', deviceId);
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      console.log('[LiveKitService] disconnect() called - disconnecting room');
      await this.room.disconnect();
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.localVideoTrackSubject.next(null);
    this.localAudioTrackSubject.next(null);
    this.localScreenShareTrackSubject.next(null);
    this.participantsSubject.next(new Map());
    this.isCameraEnabledSubject.next(false);
    this.isMicrophoneEnabledSubject.next(false);
    this.isScreenShareEnabledSubject.next(false);
    this.room = null;
  }

  isConnected(): boolean {
    return this.connectionStatusSubject.value === 'connected';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.disconnect();
  }
}

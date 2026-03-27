import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MediaDeviceService } from '../../../core/services/media-device.service';
import { IMediaDevices, IPreJoinSettings } from '../../../core/models/media-device';
import { Button } from '../../ui-components/button/button';
import { Svg } from '../../ui-components/svg/svg';
import { Typography } from '../../ui-components/typography/typography';
import { Select } from '../../ui-components/select/select';
import { Loader } from '../loader/loader';
import { SelectOption } from '../../models/select';
import { TypographyTypeEnum } from '../../constants/typography';
import { ButtonStyleEnum } from '../../constants/button';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-pre-join-lobby',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Button,
    Svg,
    Typography,
    Select,
    Loader,
    TranslatePipe,
  ],
  templateUrl: './pre-join-lobby.html',
  styleUrls: ['./pre-join-lobby.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreJoinLobby implements OnInit, OnDestroy {
  @Output() join = new EventEmitter<IPreJoinSettings>();
  @Output() close = new EventEmitter<void>();
  @ViewChild('videoPreview') videoPreviewRef!: ElementRef<HTMLVideoElement>;

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;

  cameraEnabled = signal(true);
  microphoneEnabled = signal(true);
  audioLevel = signal(0);

  cameraOptions: SelectOption[] = [];
  microphoneOptions: SelectOption[] = [];
  speakerOptions: SelectOption[] = [];

  selectedCameraId: string | null = null;
  selectedMicrophoneId: string | null = null;
  selectedSpeakerId: string | null = null;

  speakerSupported = false;
  isLoading = signal(true);
  permissionDenied = signal(false);
  permissionError = signal('');

  private destroy$ = new Subject<void>();

  private t: TranslationService;

  constructor(
    private mediaDeviceService: MediaDeviceService,
    private cdr: ChangeDetectorRef,
    translationService: TranslationService
  ) {
    this.t = translationService;
  }

  async ngOnInit(): Promise<void> {
    this.speakerSupported = this.mediaDeviceService.isSpeakerSelectionSupported();

    this.mediaDeviceService.devices$
      .pipe(takeUntil(this.destroy$))
      .subscribe(devices => {
        this.updateDeviceOptions(devices);
        this.cdr.markForCheck();
      });

    this.mediaDeviceService.audioLevel$
      .pipe(takeUntil(this.destroy$))
      .subscribe(level => {
        this.audioLevel.set(level);
        this.cdr.markForCheck();
      });

    await this.initializeDevices();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.mediaDeviceService.stopPreview();
  }

  private async initializeDevices(): Promise<void> {
    this.isLoading.set(true);
    let cameraStarted = false;
    try {
      // Try video preview separately - camera may not be available
      try {
        await this.mediaDeviceService.startVideoPreview();
        cameraStarted = true;
      } catch {
        this.cameraEnabled.set(false);
      }

      // Try audio monitor separately
      try {
        await this.mediaDeviceService.startAudioMonitor();
      } catch {
        this.microphoneEnabled.set(false);
      }

      const devices = await this.mediaDeviceService.enumerateDevices();
      this.updateDeviceOptions(devices);

      if (devices.cameras.length > 0) {
        this.selectedCameraId = devices.cameras[0].deviceId;
      } else {
        this.cameraEnabled.set(false);
      }
      if (devices.microphones.length > 0) {
        this.selectedMicrophoneId = devices.microphones[0].deviceId;
      }
      if (devices.speakers.length > 0) {
        this.selectedSpeakerId = devices.speakers[0].deviceId;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.permissionDenied.set(true);
        this.permissionError.set(this.t.instant('preJoinLobby.permissionDenied'));
        this.cameraEnabled.set(false);
        this.microphoneEnabled.set(false);
      } else {
        this.permissionError.set(this.t.instant('preJoinLobby.failedAccessDevices'));
      }
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
      // Attach video preview after loading is done so the <video> element exists in the DOM
      if (cameraStarted && this.cameraEnabled()) {
        this.attachVideoPreview();
      }
    }
  }

  private updateDeviceOptions(devices: IMediaDevices): void {
    this.cameraOptions = devices.cameras.map((d, i) => ({
      label: d.label || `Camera ${i + 1}`,
      value: d.deviceId,
    }));
    this.microphoneOptions = devices.microphones.map((d, i) => ({
      label: d.label || `Microphone ${i + 1}`,
      value: d.deviceId,
    }));
    this.speakerOptions = devices.speakers.map((d, i) => ({
      label: d.label || `Speaker ${i + 1}`,
      value: d.deviceId,
    }));
  }

  private attachVideoPreview(): void {
    setTimeout(() => {
      const stream = this.mediaDeviceService.getPreviewStream();
      if (this.videoPreviewRef?.nativeElement && stream) {
        this.videoPreviewRef.nativeElement.srcObject = stream;
      }
    });
  }

  async toggleCamera(): Promise<void> {
    const newState = !this.cameraEnabled();
    this.cameraEnabled.set(newState);
    if (newState) {
      try {
        await this.mediaDeviceService.startVideoPreview(this.selectedCameraId || undefined);
        this.attachVideoPreview();
      } catch {
        this.cameraEnabled.set(false);
      }
    } else {
      this.mediaDeviceService.stopVideoPreview();
    }
    this.cdr.markForCheck();
  }

  async toggleMicrophone(): Promise<void> {
    const newState = !this.microphoneEnabled();
    this.microphoneEnabled.set(newState);
    if (newState) {
      try {
        await this.mediaDeviceService.startAudioMonitor(this.selectedMicrophoneId || undefined);
      } catch {
        this.microphoneEnabled.set(false);
      }
    } else {
      this.mediaDeviceService.stopAudioMonitor();
    }
    this.cdr.markForCheck();
  }

  async onCameraChange(deviceId: string | number): Promise<void> {
    this.selectedCameraId = String(deviceId);
    if (this.cameraEnabled()) {
      try {
        await this.mediaDeviceService.switchCamera(this.selectedCameraId);
        this.attachVideoPreview();
      } catch {
        this.cameraEnabled.set(false);
      }
      this.cdr.markForCheck();
    }
  }

  async onMicrophoneChange(deviceId: string | number): Promise<void> {
    this.selectedMicrophoneId = String(deviceId);
    if (this.microphoneEnabled()) {
      try {
        await this.mediaDeviceService.switchMicrophone(this.selectedMicrophoneId);
      } catch {
        this.microphoneEnabled.set(false);
      }
      this.cdr.markForCheck();
    }
  }

  onSpeakerChange(deviceId: string | number): void {
    this.selectedSpeakerId = String(deviceId);
  }

  onClose(): void {
    this.close.emit();
  }

  onJoin(): void {
    this.join.emit({
      cameraEnabled: this.cameraEnabled(),
      microphoneEnabled: this.microphoneEnabled(),
      cameraDeviceId: this.selectedCameraId,
      microphoneDeviceId: this.selectedMicrophoneId,
      speakerDeviceId: this.selectedSpeakerId,
    });
  }

  getAudioBars(): boolean[] {
    const level = this.audioLevel();
    return [
      level > 0.05,
      level > 0.15,
      level > 0.3,
      level > 0.5,
      level > 0.7,
    ];
  }
}

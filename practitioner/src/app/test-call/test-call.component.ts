import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { DeviceSelectionComponent } from '../components/device-selection/device-selection.component';
import { TypographyComponent } from '../components/typography/typography.component';
import { ToastContainerComponent } from '../components/toast-container/toast-container.component';
import { ToastService } from '../services/toast/toast.service';

@Component({
  selector: 'app-test-call',
  standalone: true,
  imports: [
    CommonModule,
    DeviceSelectionComponent,
    TypographyComponent,
    ToastContainerComponent,
  ],
  templateUrl: './test-call.component.html',
  styleUrls: ['./test-call.component.scss'],
})
export class TestCallComponent implements OnInit, AfterViewInit {
  @ViewChild('videoPreview', { static: false })
  videoPreview!: ElementRef<HTMLVideoElement>;
  @ViewChild('audioMeter', { static: false })
  audioMeter!: ElementRef<HTMLDivElement>;

  audioInputDevices: MediaDeviceInfo[] = [];
  selectedAudioDeviceId: string | undefined;

  audioContext?: AudioContext;
  analyser?: AnalyserNode;
  microphoneStream?: MediaStreamAudioSourceNode;
  mediaStream?: MediaStream;
  constructor(private toast: ToastService) { }

  async ngOnInit(): Promise<void> {
    await this.enumerateAudioDevices();
  }

  ngAfterViewInit(): void {
    this.startMedia();
  }

  private async startMedia(): Promise<void> {
    try {
      const audioConstraints = this.selectedAudioDeviceId
        ? { deviceId: { exact: this.selectedAudioDeviceId } }
        : true;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: audioConstraints,
      });

      this.videoPreview.nativeElement.srcObject = this.mediaStream;
      this.setupAudioAnalyzer();
    } catch (err) {
      this.toast.show('⚠️ Cannot access camera/microphone');
    }
  }

  private setupAudioAnalyzer(): void {
    if (!this.mediaStream) {
      return;
    }

    this.audioContext = new AudioContext();
    this.microphoneStream = this.audioContext.createMediaStreamSource(
      this.mediaStream
    );
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.microphoneStream.connect(this.analyser);
    this.updateAudioMeter();
  }

  private updateAudioMeter(): void {
    if (!this.analyser) {
      return;
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    const avg =
      dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

    this.audioMeter.nativeElement.style.width = (avg / 255) * 100 + '%';
    requestAnimationFrame(() => this.updateAudioMeter());
  }

  private async enumerateAudioDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.audioInputDevices = devices.filter((d) => d.kind === 'audioinput');

      // default to first device
      if (this.audioInputDevices.length) {
        this.selectedAudioDeviceId = this.audioInputDevices[0].deviceId;
      }
    } catch (err) {
      // Silently fail - device enumeration is not critical
    }
  }

  async switchAudioInput(deviceId: string): Promise<void> {
    this.selectedAudioDeviceId = deviceId;

    this.mediaStream?.getAudioTracks().forEach((t) => t.stop());

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { deviceId: { exact: deviceId } },
      });
      this.videoPreview.nativeElement.srcObject = this.mediaStream;

      if (this.audioContext && this.analyser) {
        this.microphoneStream?.disconnect();
        this.microphoneStream = this.audioContext.createMediaStreamSource(
          this.mediaStream
        );
        this.microphoneStream.connect(this.analyser);
      }
    } catch (err) {
      this.toast.show('⚠️ Error switching audio device');
    }
  }
}

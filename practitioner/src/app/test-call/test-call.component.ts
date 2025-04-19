import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-test-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-call.component.html',
  styleUrls: ['./test-call.component.scss'],
})
export class TestCallComponent implements OnInit, AfterViewInit {
  @ViewChild('videoPreview', { static: false })
  videoPreview!: ElementRef<HTMLVideoElement>;
  @ViewChild('audioMeter', { static: false })
  audioMeter!: ElementRef<HTMLDivElement>;

  audioInputDevices: MediaDeviceInfo[] = [];
  selectedAudioDeviceId: string | null = null;

  audioContext?: AudioContext;
  analyser?: AnalyserNode;
  microphoneStream?: MediaStreamAudioSourceNode;
  mediaStream?: MediaStream;

  async ngOnInit(): Promise<void> {
    await this.enumerateAudioDevices();
  }

  ngAfterViewInit(): void {
    this.startMedia();
  }

  async startMedia() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.videoPreview.nativeElement.srcObject = this.mediaStream;
      this.audioContext = new AudioContext();
      this.microphoneStream = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.microphoneStream.connect(this.analyser);
      this.updateAudioMeter();
    } catch (err) {
      console.error('Error accessing media devices', err);
    }
  }

  updateAudioMeter() {
    if (!this.analyser) {
      return;
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    const avg =
      dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    if (this.audioMeter && this.audioMeter.nativeElement) {
      this.audioMeter.nativeElement.style.width = (avg / 255) * 100 + '%';
    }
    requestAnimationFrame(() => this.updateAudioMeter());
  }

  async enumerateAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.audioInputDevices = devices.filter(
        (device) => device.kind === 'audioinput'
      );
      if (this.audioInputDevices.length > 0) {
        this.selectedAudioDeviceId = this.audioInputDevices[0].deviceId;
      }
    } catch (err) {
      console.error('Error enumerating devices', err);
    }
  }

  async switchAudioInput(event: Event): Promise<void> {
    const selectElement = event.target as HTMLSelectElement;
    const deviceId = selectElement.value;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => track.stop());
    }
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { deviceId: { exact: deviceId } },
      });
      this.videoPreview.nativeElement.srcObject = this.mediaStream;
      if (this.audioContext && this.analyser) {
        if (this.microphoneStream) {
          this.microphoneStream.disconnect();
        }
        this.microphoneStream = this.audioContext.createMediaStreamSource(
          this.mediaStream
        );
        this.microphoneStream.connect(this.analyser);
      }
    } catch (err) {
      console.error('Error switching audio device', err);
    }
  }
}

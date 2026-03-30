import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface MediaDeviceInfo {
  deviceId: string;
  kind: 'videoinput' | 'audioinput' | 'audiooutput';
  label: string;
  groupId: string;
}

export interface MediaPermissionStatus {
  camera: {
    available: boolean;
    enabled: boolean;
    blocked: boolean;
    error?: string;
    deviceCount: number;
  };
  microphone: {
    available: boolean;
    enabled: boolean;
    blocked: boolean;
    error?: string;
    deviceCount: number;
  };
  lastChecked: Date;
}

export interface MediaConstraints {
  video?: MediaTrackConstraints | boolean;
  audio?: MediaTrackConstraints | boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MediaPermissionService {
  private permissionStatus$ = new BehaviorSubject<MediaPermissionStatus>({
    camera: {
      available: false,
      enabled: false,
      blocked: false,
      deviceCount: 0
    },
    microphone: {
      available: false,
      enabled: false,
      blocked: false,
      deviceCount: 0
    },
    lastChecked: new Date()
  });

  private currentStream: MediaStream | null = null;
  private availableDevices: MediaDeviceInfo[] = [];

  constructor() {
    this.initializePermissionChecking();
    this.setupDeviceChangeListener();
  }

  getPermissionStatus(): Observable<MediaPermissionStatus> {
    return this.permissionStatus$.asObservable();
  }

  async checkAndRequestPermissions(constraints: MediaConstraints = { video: true, audio: true }): Promise<MediaPermissionStatus> {
    const status: MediaPermissionStatus = {
      camera: { available: false, enabled: false, blocked: false, deviceCount: 0 },
      microphone: { available: false, enabled: false, blocked: false, deviceCount: 0 },
      lastChecked: new Date()
    };

    try {
      // First, enumerate devices to check availability
      await this.updateAvailableDevices();

      const videoDevices = this.availableDevices.filter(d => d.kind === 'videoinput');
      const audioDevices = this.availableDevices.filter(d => d.kind === 'audioinput');

      status.camera.deviceCount = videoDevices.length;
      status.microphone.deviceCount = audioDevices.length;
      status.camera.available = videoDevices.length > 0;
      status.microphone.available = audioDevices.length > 0;

      // Request permissions
      if (constraints.video && status.camera.available) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: constraints.video });
          status.camera.enabled = true;
          status.camera.blocked = false;

          // Stop the stream immediately as we're just checking permissions
          stream.getTracks().forEach(track => track.stop());
        } catch (error) {
          status.camera = this.handleMediaError(error as Error, 'camera');
        }
      }

      if (constraints.audio && status.microphone.available) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio });
          status.microphone.enabled = true;
          status.microphone.blocked = false;

          // Stop the stream immediately as we're just checking permissions
          stream.getTracks().forEach(track => track.stop());
        } catch (error) {
          status.microphone = this.handleMediaError(error as Error, 'microphone');
        }
      }

    } catch (error) {
      console.error('Failed to check media permissions:', error);
      status.camera.error = 'Failed to access media devices';
      status.microphone.error = 'Failed to access media devices';
    }

    this.permissionStatus$.next(status);
    return status;
  }

  async requestMediaStream(constraints: MediaConstraints): Promise<MediaStream> {
    try {
      // Stop any existing stream
      this.stopCurrentStream();

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;

      // Update permission status based on successful stream acquisition
      const status = this.permissionStatus$.value;
      if (constraints.video) {
        status.camera.enabled = true;
        status.camera.blocked = false;
        status.camera.error = undefined;
      }
      if (constraints.audio) {
        status.microphone.enabled = true;
        status.microphone.blocked = false;
        status.microphone.error = undefined;
      }
      status.lastChecked = new Date();
      this.permissionStatus$.next(status);

      return stream;
    } catch (error) {
      const mediaError = error as Error;
      console.error('Failed to get media stream:', mediaError);

      // Update permission status with error information
      this.updatePermissionError(mediaError, constraints);
      throw error;
    }
  }

  private handleMediaError(error: Error, deviceType: 'camera' | 'microphone') {
    const deviceStatus = {
      available: true, // Device exists but has permission issues
      enabled: false,
      blocked: false,
      error: error.message,
      deviceCount: deviceType === 'camera' ?
        this.availableDevices.filter(d => d.kind === 'videoinput').length :
        this.availableDevices.filter(d => d.kind === 'audioinput').length
    };

    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        deviceStatus.blocked = true;
        deviceStatus.error = `${deviceType === 'camera' ? 'Camera' : 'Microphone'} access denied. Please allow access in your browser settings.`;
        break;
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        deviceStatus.available = false;
        deviceStatus.error = `No ${deviceType} device found.`;
        break;
      case 'NotReadableError':
      case 'TrackStartError':
        deviceStatus.error = `${deviceType === 'camera' ? 'Camera' : 'Microphone'} is already in use by another application.`;
        break;
      case 'OverconstrainedError':
        deviceStatus.error = `${deviceType === 'camera' ? 'Camera' : 'Microphone'} constraints cannot be satisfied.`;
        break;
      case 'TypeError':
        deviceStatus.error = `Invalid ${deviceType} constraints specified.`;
        break;
      default:
        deviceStatus.error = `Failed to access ${deviceType}: ${error.message}`;
    }

    return deviceStatus;
  }

  private updatePermissionError(error: Error, constraints: MediaConstraints): void {
    const status = { ...this.permissionStatus$.value };

    if (constraints.video) {
      status.camera = this.handleMediaError(error, 'camera');
    }
    if (constraints.audio) {
      status.microphone = this.handleMediaError(error, 'microphone');
    }

    status.lastChecked = new Date();
    this.permissionStatus$.next(status);
  }

  async updateAvailableDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = devices.map(device => ({
        deviceId: device.deviceId,
        kind: device.kind as 'videoinput' | 'audioinput' | 'audiooutput',
        label: device.label,
        groupId: device.groupId
      }));

      return this.availableDevices;
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return [];
    }
  }

  getAvailableDevices(): MediaDeviceInfo[] {
    return [...this.availableDevices];
  }

  getCurrentStream(): MediaStream | null {
    return this.currentStream;
  }

  stopCurrentStream(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
      const status = this.permissionStatus$.value;
      status.camera.enabled = false;
      status.microphone.enabled = false;
      status.lastChecked = new Date();
      this.permissionStatus$.next(status);
    }
  }

  async toggleCamera(): Promise<boolean> {
    const status = this.permissionStatus$.value;
    if (status.camera.enabled && this.currentStream) {
      // Disable camera
      this.currentStream.getVideoTracks().forEach(track => track.stop());
      status.camera.enabled = false;
      this.permissionStatus$.next({ ...status, lastChecked: new Date() });
      return false;
    } else if (!status.camera.blocked && status.camera.available) {
      // Enable camera
      try {
        await this.requestMediaStream({ video: true });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async toggleMicrophone(): Promise<boolean> {
    const status = this.permissionStatus$.value;
    if (status.microphone.enabled && this.currentStream) {
      // Mute microphone
      const audioTracks = this.currentStream.getAudioTracks();
      audioTracks.forEach(track => (track.enabled = !track.enabled));
      const enabled = audioTracks.some(track => track.enabled);
      status.microphone.enabled = enabled;
      this.permissionStatus$.next({ ...status, lastChecked: new Date() });
      return enabled;
    } else if (!status.microphone.blocked && status.microphone.available) {
      // Enable microphone
      try {
        await this.requestMediaStream({ audio: true });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private initializePermissionChecking(): void {
    // Check permissions on service initialization
    this.checkAndRequestPermissions({ video: false, audio: false }).catch(() => { });
  }

  private setupDeviceChangeListener(): void {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.updateAvailableDevices().then(() => {
          this.checkAndRequestPermissions({ video: false, audio: false });
        });
      });
    }
  }

  // Utility method to get user-friendly error messages
  getPermissionGuideMessage(deviceType: 'camera' | 'microphone'): string {
    const status = this.permissionStatus$.value;
    const device = deviceType === 'camera' ? status.camera : status.microphone;

    if (!device.available) {
      return `No ${deviceType} device detected. Please connect a ${deviceType} and refresh the page.`;
    }

    if (device.blocked) {
      return `${deviceType === 'camera' ? 'Camera' : 'Microphone'} access is blocked. Please click the camera/microphone icon in your browser's address bar and allow access.`;
    }

    if (device.error) {
      return device.error;
    }

    return `${deviceType === 'camera' ? 'Camera' : 'Microphone'} is ready to use.`;
  }
}

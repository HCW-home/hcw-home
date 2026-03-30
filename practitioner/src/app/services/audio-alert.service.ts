import { Injectable } from '@angular/core';

export interface NotificationSound {
  type: 'patient_joined' | 'message_received' | 'participant_left' | 'consultation_started' | 'error' | 'urgent_alert' | 'reminder';
  volume?: number;
}

export interface AudioAlertConfig {
  volume: number;
  enabled: boolean;
  patientJoinSound: string;
  urgentAlertSound: string;
  reminderSound: string;
}

@Injectable({ providedIn: 'root' })
export class AudioAlertService {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();
  private soundBuffers: Map<string, AudioBuffer> = new Map();
  private enabled = true;
  private volume = 0.7;
  private _isInitialized = false;

  private config: AudioAlertConfig = {
    volume: 0.7,
    enabled: true,
    patientJoinSound: 'patient-joined',
    urgentAlertSound: 'urgent-alert',
    reminderSound: 'reminder'
  };

  constructor() {
    this.initializeAudioContext();
    this.preloadSounds();
    this.loadDefaultSounds();
  }

  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this._isInitialized = true;
      console.log('[AudioAlertService] Audio context initialized successfully');
    } catch (error) {
      console.warn('[AudioAlertService] Audio notification not supported:', error);
    }
  }

  /**
   * Load default sound files for enhanced audio alerts
   */
  private async loadDefaultSounds(): Promise<void> {
    const defaultSounds = [
      { key: 'patient-joined', frequency: 880, duration: 0.3 },
      { key: 'urgent-alert', frequency: 1200, duration: 0.5 },
      { key: 'reminder', frequency: 660, duration: 0.4 }
    ];

    for (const sound of defaultSounds) {
      try {
        const buffer = await this.generateToneBuffer(sound.frequency, sound.duration);
        this.soundBuffers.set(sound.key, buffer);
      } catch (error) {
        console.error(`[AudioAlertService] Failed to generate ${sound.key} sound:`, error);
      }
    }
  }

  /**
   * Generate a tone buffer for audio alerts
   */
  private async generateToneBuffer(frequency: number, duration: number): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('Audio context not available');

    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 2);
    }

    return buffer;
  }

  private async preloadSounds(): Promise<void> {
    const soundFiles = {
      patient_joined: '/assets/sounds/patient-joined.mp3',
      message_received: '/assets/sounds/message-received.mp3',
      participant_left: '/assets/sounds/participant-left.mp3',
      consultation_started: '/assets/sounds/consultation-started.mp3',
      error: '/assets/sounds/error.mp3',
      urgent_alert: '/assets/sounds/urgent-alert.mp3',
      reminder: '/assets/sounds/reminder.mp3'
    };

    for (const [type, url] of Object.entries(soundFiles)) {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        if (this.audioContext) {
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          this.sounds.set(type, audioBuffer);
        }
      } catch (error) {
        console.warn(`Failed to load sound ${type}:`, error);
      }
    }
  }

  async playNotificationSound(notification: NotificationSound): Promise<void> {
    if (!this.enabled || !this.audioContext || !this.sounds.has(notification.type)) {
      return;
    }

    try {
      // Resume audio context if suspended (required for Chrome autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const audioBuffer = this.sounds.get(notification.type);
      if (!audioBuffer) return;

      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = audioBuffer;
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      gainNode.gain.value = (notification.volume ?? this.volume);
      source.start(0);

    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }

  // Create simple beep sound if audio files are not available
  async playBeep(frequency = 800, duration = 200): Promise<void> {
    if (!this.audioContext || !this.enabled) return;

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration / 1000);

    } catch (error) {
      console.warn('Failed to play beep sound:', error);
    }
  }

  async playUrgentAlert(): Promise<void> {
    try {
      await this.playNotificationSound({ type: 'urgent_alert' });
      console.log('[AudioAlertService] Urgent alert played');
    } catch (error) {
      console.error('[AudioAlertService] Failed to play urgent alert:', error);
    }
  }

  async playMultiplePatientAlert(waitingCount: number): Promise<void> {
    try {
      const beepCount = Math.min(waitingCount, 5);
      for (let i = 0; i < beepCount; i++) {
        await this.playBeep(880, 150);
        if (i < beepCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      console.log(`[AudioAlertService] Multiple patient alert played (${beepCount} beeps)`);
    } catch (error) {
      console.error('[AudioAlertService] Failed to play multiple patient alert:', error);
    }
  }

  async playPatientJoinedAlert(): Promise<void> {
    try {
      await this.playNotificationSound({ type: 'patient_joined' });
      console.log('[AudioAlertService] Patient joined alert played');
    } catch (error) {
      console.error('[AudioAlertService] Failed to play patient joined alert:', error);
    }
  }

  async playReminderAlert(): Promise<void> {
    try {
      await this.playNotificationSound({ type: 'reminder' });
      console.log('[AudioAlertService] Reminder alert played');
    } catch (error) {
      console.error('[AudioAlertService] Failed to play reminder alert:', error);
    }
  }

  async requestAudioPermission(): Promise<boolean> {
    try {
      // For modern browsers, test by trying to create and play a silent audio
      if (this.audioContext) {
        await this.resumeAudioContext();
        console.log('[AudioAlertService] Audio permission granted');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[AudioAlertService] Audio permission denied:', error);
      return false;
    }
  }

  async resumeAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[AudioAlertService] Audio context resumed');
      } catch (error) {
        console.warn('[AudioAlertService] Could not resume audio context:', error);
      }
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      // For modern browsers, test by trying to create and play a silent audio
      if (this.audioContext) {
        await this.resumeAudioContext();
        console.log('[AudioAlertService] Audio permission granted');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[AudioAlertService] Audio permission denied:', error);
      return false;
    }
  }

  updateConfig(config: Partial<AudioAlertConfig>): void {
    this.config = { ...this.config, ...config };
    this.enabled = this.config.enabled;
    this.volume = this.config.volume;
    console.log('[AudioAlertService] Configuration updated:', this.config);
  }

  getConfig(): AudioAlertConfig {
    return { ...this.config };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.config.enabled = enabled;
    console.log(`[AudioAlertService] Audio alerts ${enabled ? 'enabled' : 'disabled'}`);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.config.volume = this.volume;
    console.log(`[AudioAlertService] Volume set to ${this.config.volume}`);
  }

  async testAudio(): Promise<boolean> {
    try {
      await this.playBeep(800, 200);
      return true;
    } catch (error) {
      console.error('[AudioAlertService] Audio test failed:', error);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && !!this.audioContext;
  }

  isInitialized(): boolean {
    return this._isInitialized;
  }
}

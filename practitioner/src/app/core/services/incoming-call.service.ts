import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { RoutePaths } from '../constants/routes';
import { ToasterService } from './toaster.service';
import { TranslationService } from './translation.service';

export interface IncomingCallData {
  callerName: string;
  callerPicture?: string;
  appointmentId: number;
  consultationId: number;
}

const INCOMING_CALL_TOAST_ID = 'incoming-call';

@Injectable({
  providedIn: 'root',
})
export class IncomingCallService {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private activeCallAppointmentId: number | null = null;
  private currentCallData: IncomingCallData | null = null;
  private currentNotification: Notification | null = null;

  constructor(
    private router: Router,
    private toasterService: ToasterService,
    private t: TranslationService
  ) {
    this.requestNotificationPermission();
  }

  private async requestNotificationPermission(): Promise<void> {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  showIncomingCall(data: IncomingCallData): void {
    if (this.currentCallData) {
      return;
    }

    if (this.activeCallAppointmentId === data.appointmentId) {
      return;
    }

    this.currentCallData = data;
    this.playRingtone();
    this.startTimeout();
    this.showSystemNotification(data);

    this.toasterService.show('neutral', `${data.callerName}`, this.t.instant('incomingCall.isCalling'), {
      id: INCOMING_CALL_TOAST_ID,
      delay: -1,
      closable: false,
      icon: 'phone',
      actions: [
        { label: this.t.instant('incomingCall.accept'), callback: () => this.acceptCall() },
        { label: this.t.instant('incomingCall.decline'), callback: () => this.dismissIncomingCall() },
      ],
    });
  }

  private showSystemNotification(data: IncomingCallData): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const title = this.t.instant('incomingCall.isCalling');
    const body = data.callerName;

    this.currentNotification = new Notification(title, {
      body,
      icon: '/images/logo.svg',
      badge: '/images/logo.svg',
      tag: 'incoming-call',
      requireInteraction: true,
      silent: false,
    });

    this.currentNotification.onclick = () => {
      window.focus();
      this.currentNotification?.close();
    };
  }

  dismissIncomingCall(): void {
    this.stopRingtone();
    this.clearTimeout();
    this.currentCallData = null;
    this.toasterService.dismiss(INCOMING_CALL_TOAST_ID);
    this.closeSystemNotification();
  }

  private closeSystemNotification(): void {
    if (this.currentNotification) {
      this.currentNotification.close();
      this.currentNotification = null;
    }
  }

  acceptCall(): void {
    const callData = this.currentCallData;
    if (!callData) {
      return;
    }

    this.stopRingtone();
    this.clearTimeout();
    this.currentCallData = null;
    this.toasterService.dismiss(INCOMING_CALL_TOAST_ID);
    this.closeSystemNotification();

    this.router.navigate([
      '/',
      RoutePaths.USER,
      RoutePaths.CONSULTATIONS,
      callData.consultationId,
    ], {
      queryParams: { appointmentId: callData.appointmentId, join: true }
    });
  }

  setActiveCall(appointmentId: number): void {
    this.activeCallAppointmentId = appointmentId;
  }

  clearActiveCall(): void {
    this.activeCallAppointmentId = null;
  }

  private playRingtone(): void {
    try {
      this.audioElement = new Audio('/audio/ringtone.mp3');
      this.audioElement.loop = false;
      this.audioElement.play().catch(() => {});
    } catch {
    }
  }

  private stopRingtone(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement = null;
    }
  }

  private startTimeout(): void {
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      this.dismissIncomingCall();
    }, 45000);
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

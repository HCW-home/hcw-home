import { Injectable } from '@angular/core';
import { NavController } from '@ionic/angular/standalone';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface IncomingCallData {
  callerName: string;
  callerPicture?: string;
  appointmentId?: number;
  consultationId: number;
  type: 'appointment' | 'consultation';
}

@Injectable({
  providedIn: 'root',
})
export class IncomingCallService {
  private incomingCallSubject = new BehaviorSubject<IncomingCallData | null>(null);
  private callDismissedSubject = new Subject<{ consultationId: number }>();
  private callAcceptedSubject = new Subject<{ consultationId: number }>();
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private activeCallAppointmentId: number | null = null;
  private activeCallConsultationId: number | null = null;

  public incomingCall$: Observable<IncomingCallData | null> = this.incomingCallSubject.asObservable();
  public callDismissed$: Observable<{ consultationId: number }> = this.callDismissedSubject.asObservable();
  public callAccepted$: Observable<{ consultationId: number }> = this.callAcceptedSubject.asObservable();

  constructor(
    private navCtrl: NavController
  ) {}

  showIncomingCall(data: IncomingCallData): void {
    if (this.incomingCallSubject.value) {
      return;
    }

    if (data.type === 'appointment' && data.appointmentId && this.activeCallAppointmentId === data.appointmentId) {
      return;
    }

    if (data.type === 'consultation' && this.activeCallConsultationId === data.consultationId) {
      return;
    }

    this.incomingCallSubject.next(data);
    this.playRingtone();
    this.startTimeout();
  }

  dismissIncomingCall(): void {
    const callData = this.incomingCallSubject.value;
    this.stopRingtone();
    this.clearTimeout();
    this.incomingCallSubject.next(null);

    if (callData) {
      this.callDismissedSubject.next({ consultationId: callData.consultationId });
    }
  }

  acceptCall(): void {
    const callData = this.incomingCallSubject.value;
    if (!callData) {
      return;
    }

    this.stopRingtone();
    this.clearTimeout();
    this.incomingCallSubject.next(null);

    if (callData.type === 'consultation') {
      this.callAcceptedSubject.next({ consultationId: callData.consultationId });
    }

    if (callData.type === 'consultation') {
      this.navCtrl.navigateForward(['/consultation', callData.consultationId, 'video'], {
        queryParams: { type: 'consultation', autoJoin: true }
      });
    } else {
      this.navCtrl.navigateForward(['/consultation', callData.consultationId, 'video'], {
        queryParams: { appointmentId: callData.appointmentId, autoJoin: true }
      });
    }
  }

  setActiveCall(appointmentId: number): void {
    this.activeCallAppointmentId = appointmentId;
  }

  setActiveConsultationCall(consultationId: number): void {
    this.activeCallConsultationId = consultationId;
  }

  clearActiveCall(): void {
    this.activeCallAppointmentId = null;
    this.activeCallConsultationId = null;
  }

  private playRingtone(): void {
    try {
      this.audioElement = new Audio('/assets/audio/ringtone.mp3');
      this.audioElement.loop = true;
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

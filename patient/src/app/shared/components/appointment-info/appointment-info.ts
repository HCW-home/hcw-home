import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

import { Appointment, Participant } from '../../../core/models/consultation.model';
import { AuthService } from '../../../core/services/auth.service';
import { TranslationService } from '../../../core/services/translation.service';
import { LocalDatePipe } from '../../pipes/local-date.pipe';

@Component({
  selector: 'app-appointment-info',
  templateUrl: './appointment-info.html',
  styleUrls: ['./appointment-info.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    LocalDatePipe,
  ]
})
export class AppointmentInfoComponent {
  private t = inject(TranslationService);
  private authService = inject(AuthService);

  @Input({ required: true }) appointment!: Appointment;
  @Input() label = '';

  get otherParticipants(): Participant[] {
    if (!this.appointment.participants) return [];
    const currentUser = this.authService.currentUserValue;
    if (!currentUser) return this.appointment.participants;
    return this.appointment.participants.filter(p => {
      if (p.user) {
        return p.user.id !== currentUser.id && p.user.id !== currentUser.pk;
      }
      if (p.email) {
        return p.email !== currentUser.email;
      }
      return true;
    });
  }

  getParticipantName(p: Participant): string {
    if (p.user) return `${p.user.first_name} ${p.user.last_name}`;
    if (p.first_name || p.last_name) return `${p.first_name || ''} ${p.last_name || ''}`.trim();
    return p.email || '';
  }

  get typeIcon(): string {
    return this.appointment.type === 'online' ? 'videocam-outline' : 'location-outline';
  }

  get typeLabel(): string {
    return this.appointment.type === 'online'
      ? this.t.instant('common.video')
      : this.t.instant('common.inPerson');
  }
}

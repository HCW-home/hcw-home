import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

import { Appointment } from '../../../core/models/consultation.model';
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

  @Input({ required: true }) appointment!: Appointment;
  @Input() label = '';

  get typeIcon(): string {
    return this.appointment.type === 'online' ? 'videocam-outline' : 'location-outline';
  }

  get typeLabel(): string {
    return this.appointment.type === 'online'
      ? this.t.instant('common.video')
      : this.t.instant('common.inPerson');
  }
}

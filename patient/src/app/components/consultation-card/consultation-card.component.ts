import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Consultation, ConsultationStatus } from '../../models/consultation.model';
import { CommonModule } from '@angular/common';
import { IonCard, IonButton, IonBadge, IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { videocamOutline, timeOutline, personOutline, informationCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-consultation-card',
  templateUrl: './consultation-card.component.html',
  styleUrls: ['./consultation-card.component.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    IonCard, 
    IonButton, 
    IonBadge,
    IonIcon,
    IonRippleEffect
  ]
})
export class ConsultationCardComponent {
  @Input() consultation!: Consultation;
  @Output() joinConsultation = new EventEmitter<number>();
  
  ConsultationStatus = ConsultationStatus;

  constructor() {
    addIcons({ 
      videocamOutline,
      timeOutline,
      personOutline,
      informationCircleOutline
    });
  }

  getPractitionerName(): string {
    if (!this.consultation.participants || this.consultation.participants.length === 0) {
      return 'Doctor';
    }
    const practitioner = this.consultation.participants[0].user;
    if (!practitioner) {
      return 'Doctor';
    }
    return `${practitioner.firstName} ${practitioner.lastName}`;
  }

  getFormattedDate(): string {
    const date = this.consultation.startedAt || this.consultation.scheduledDate;
    if (!date) {
      return 'Unscheduled';
    }
    return new Date(date).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onJoin(): void {
    this.joinConsultation.emit(this.consultation.id);
  }
} 
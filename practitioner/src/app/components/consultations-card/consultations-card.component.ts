import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Consultation } from '../../models/consultations/consultation.model';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../constants/route-paths.enum';
import { ButtonComponent } from '../ui/button/button.component';
import { ButtonSize, ButtonVariant } from '../../constants/button.enums';

@Component({
  selector: 'app-consultation-card',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent],
  templateUrl: './consultations-card.component.html',
  styleUrls: ['./consultations-card.component.scss'],
})
export class ConsultationCardComponent {
  @Input() title = 'CONSULTATIONS';
  @Input() description = 'List of consultations';
  @Input() consultations: Consultation[] = [];
  @Input() routerLink: RoutePaths = RoutePaths.OpenConsultations;
  
  @Input() icon: string = '';  

  readonly ButtonSize = ButtonSize;
  readonly ButtonVariant = ButtonVariant;

  getPatientName(consultation: Consultation): string {
    const participant = consultation.participants?.[0];
    return participant ? `${participant.user.firstName} ${participant.user.lastName}` : 'Unknown';
  }

  getCountry(consultation: Consultation): string {
    return consultation.participants?.[0]?.user.country || 'Unknown';
  }

  getJoinTime(consultation: Consultation): string {
    const joinedAt = consultation.participants?.[0]?.joinedAt;
    return joinedAt ? this.formatTime(new Date(joinedAt)) : 'N/A';
  }

  getScheduledDate(consultation: Consultation): string {
    return consultation.scheduledDate
      ? new Date(consultation.scheduledDate).toLocaleDateString()
      : 'N/A';
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}


import { Component, Input, Output, EventEmitter, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../constants/route-paths.enum';
import { ButtonComponent } from '../ui/button/button.component';
import { ButtonSize, ButtonVariant } from '../../constants/button.enums';
import { ConsultationWithPatient } from '../../dtos';
import { TourType } from '../../models/tour';
import { TourMatMenuModule } from 'ngx-ui-tour-md-menu';

@Component({
  selector: 'app-consultation-card',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, TourMatMenuModule],
  templateUrl: './consultations-card.component.html',
  styleUrls: ['./consultations-card.component.scss'],
})
export class ConsultationCardComponent {
  title = input('CONSULTATIONS');
  description = input('List of consultations');
  consultations = input<ConsultationWithPatient[]>([]); 
  routerLink = input(RoutePaths.OpenConsultations);
  tourAnchor = input('');
  showInvite = input(true);
  @Output() invite = new EventEmitter<void>();

  readonly ButtonSize = ButtonSize;
  readonly ButtonVariant = ButtonVariant;
  readonly TourType = TourType;

  formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByConsultationId(
    _idx: number,
    history: ConsultationWithPatient 
  ): number {
    return history.consultation.id;
  }

  onInviteClick() {
    this.invite.emit();
  }
}
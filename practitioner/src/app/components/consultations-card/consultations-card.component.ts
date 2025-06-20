import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationHistoryItem } from '../../models/consultations/consultation.model';
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
  @Input() consultations: ConsultationHistoryItem[] = []; 
  @Input() routerLink = RoutePaths.OpenConsultations;

  @Input() showInvite = true;
  @Output() invite = new EventEmitter<void>();

  readonly ButtonSize = ButtonSize;
  readonly ButtonVariant = ButtonVariant;

  formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByConsultationId(
    _idx: number,
    history: ConsultationHistoryItem
  ): number {
    return history.consultation.id;
  }

  onInviteClick() {
    this.invite.emit();
  }
}

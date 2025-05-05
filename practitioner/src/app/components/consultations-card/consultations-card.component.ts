import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Consultation } from '../../models/consultations/consultation.model';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../constants/route-paths.enum';
import { ButtonComponent } from '../ui/button/button.component';
import { ButtonSize, ButtonVariant } from '../../constants/button.enums';
import { ConsultationService } from '../../services/consultations/consultation.service';

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

  readonly ButtonSize = ButtonSize;
  readonly ButtonVariant = ButtonVariant;

  constructor(private consultationService: ConsultationService) {}

  formatTime(date: Date): string {
    return this.consultationService.getFormattedTime(date);
  }
}

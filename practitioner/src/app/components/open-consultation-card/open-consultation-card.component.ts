import { Component, Input, Output, EventEmitter, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { ButtonVariant, ButtonSize } from '../../constants/button.enums';
import { SvgIconComponent } from '../../shared/components/svg-icon.component';
import {
  OpenConsultationService,
} from '../../services/consultations/open-consultation.service';
import { OpenConsultation } from '../../dtos/consultations/open-consultation.dto';
@Component({
  selector: 'app-open-consultation-card',
  standalone: true,
  imports: [CommonModule, ButtonComponent, SvgIconComponent],
  templateUrl: './open-consultation-card.component.html',
  styleUrls: ['./open-consultation-card.component.scss'],
})
export class OpenConsultationCardComponent {
  @Input() consultation!: OpenConsultation;
  @Input() isSelected: boolean = false;
  @Output() consultationClicked = new EventEmitter<OpenConsultation>();
  @Output() sendInvitation = new EventEmitter<number>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  constructor(public openConsultationService: OpenConsultationService) {}

  onCardClick(): void {
    this.consultationClicked.emit(this.consultation);
  }

  onSendInvitation(event: Event): void {
    event.stopPropagation();
    this.sendInvitation.emit(this.consultation.id);
  }

  getPatientName(): string {
    return `${this.consultation.patient.firstName} ${this.consultation.patient.lastName}`;
  }

  getFormattedDate(): string {
    return this.openConsultationService.formatDate(this.consultation.startedAt);
  }
}

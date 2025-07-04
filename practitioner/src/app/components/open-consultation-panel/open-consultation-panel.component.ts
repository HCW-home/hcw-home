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
  selector: 'app-open-consultation-panel',
  standalone: true,
  imports: [CommonModule, ButtonComponent, SvgIconComponent],
  templateUrl: './open-consultation-panel.component.html',
  styleUrls: ['./open-consultation-panel.component.scss'],
})
export class OpenConsultationPanelComponent {
  @Input() consultation!: OpenConsultation;
  @Output() close = new EventEmitter<void>();
  @Output() joinConsultation = new EventEmitter<number>();
  @Output() closeConsultation = new EventEmitter<number>();
  @Output() inviteColleague = new EventEmitter<number>();
  @Output() sendInvitation = new EventEmitter<number>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  constructor(private openConsultationService: OpenConsultationService) {}

  onClose(): void {
    this.close.emit();
  }

  onJoin(): void {
    this.joinConsultation.emit(this.consultation.id);
  }

  onCloseConsultation(): void {
    this.closeConsultation.emit(this.consultation.id);
  }

  onInviteColleague(): void {
    this.inviteColleague.emit(this.consultation.id);
  }

  onSendInvitation(): void {
    this.sendInvitation.emit(this.consultation.id);
  }

  getPatientName(): string {
    return `${this.consultation.patient.firstName} ${this.consultation.patient.lastName}`;
  }

  getFormattedDate(): string {
    return this.openConsultationService.formatDate(this.consultation.startedAt);
  }

  getFormattedInviteDate(): string {
    const date = new Date(this.consultation.startedAt);
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day} ${month} ${year} ${hours}:${minutes}`;
  }

  getSexDisplay(): string {
    const sexMap: { [key: string]: string } = {
      MALE: 'Male',
      FEMALE: 'Female',
      OTHER: 'Other',
    };
    const sex = this.consultation.patient.sex;
    return sex ? (sexMap[sex] || sex) : '';
  }
}

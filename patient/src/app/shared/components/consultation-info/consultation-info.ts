import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

import { Consultation } from '../../../core/models/consultation.model';

@Component({
  selector: 'app-consultation-info',
  templateUrl: './consultation-info.html',
  styleUrls: ['./consultation-info.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    TranslatePipe,
  ]
})
export class ConsultationInfoComponent {
  @Input({ required: true }) consultation!: Consultation;
  @Input() label?: string;
  @Input() hideAction = false;
  @Input() closeLabel = '';
  @Input() unreadCount = 0;
  @Output() access = new EventEmitter<Consultation>();
  @Output() close = new EventEmitter<void>();

  get title(): string {
    return this.consultation.title || '';
  }

  get doctorName(): string {
    if (this.consultation.owned_by) {
      return `${this.consultation.owned_by.first_name} ${this.consultation.owned_by.last_name}`;
    }
    return '';
  }

  getFormattedId(): string {
    return `#${String(this.consultation.id).padStart(6, '0')}`;
  }

  onAccess(event: Event): void {
    event.stopPropagation();
    this.access.emit(this.consultation);
  }
}

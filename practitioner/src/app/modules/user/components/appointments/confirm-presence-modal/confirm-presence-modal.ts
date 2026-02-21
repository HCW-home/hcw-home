import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { Button } from '../../../../../shared/ui-components/button/button';
import { Svg } from '../../../../../shared/ui-components/svg/svg';
import { Loader } from '../../../../../shared/components/loader/loader';
import { Typography } from '../../../../../shared/ui-components/typography/typography';
import { ConsultationService } from '../../../../../core/services/consultation.service';
import { ToasterService } from '../../../../../core/services/toaster.service';
import { TranslationService } from '../../../../../core/services/translation.service';
import {
  AppointmentType,
  IParticipantDetail,
  Participant,
  ParticipantStatus,
} from '../../../../../core/models/consultation';
import {
  ButtonStyleEnum,
  ButtonStateEnum,
  ButtonSizeEnum,
} from '../../../../../shared/constants/button';
import { TypographyTypeEnum } from '../../../../../shared/constants/typography';
import { LocalDatePipe } from '../../../../../shared/pipes/local-date.pipe';

@Component({
  selector: 'app-confirm-presence-modal',
  templateUrl: './confirm-presence-modal.html',
  styleUrl: './confirm-presence-modal.scss',
  imports: [
    CommonModule,
    ModalComponent,
    Button,
    Svg,
    Loader,
    Typography,
    LocalDatePipe,
    TranslatePipe,
  ],
})
export class ConfirmPresenceModal {
  private destroy$ = new Subject<void>();
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private t = inject(TranslationService);

  @Input() isOpen = false;
  @Input() set participantId(value: number | null) {
    this._participantId = value;
    if (value && this.isOpen) {
      this.loadParticipant();
    }
  }

  @Output() closed = new EventEmitter<void>();
  @Output() presenceConfirmed = new EventEmitter<void>();

  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly ButtonStateEnum = ButtonStateEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly AppointmentType = AppointmentType;

  _participantId: number | null = null;
  loading = signal(true);
  participant = signal<IParticipantDetail | null>(null);
  errorMessage = signal<string | null>(null);
  isConfirming = signal(false);
  isDeclining = signal(false);

  get modalTitle(): string {
    return this.t.instant('confirmPresenceModal.title');
  }

  ngOnChanges(): void {
    if (this.isOpen && this._participantId) {
      this.loadParticipant();
    }
  }

  private loadParticipant(): void {
    if (!this._participantId) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    this.participant.set(null);

    this.consultationService
      .getParticipantById(String(this._participantId))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: participant => {
          this.participant.set(participant);
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set(
            this.t.instant('confirmPresenceModal.loadError')
          );
          this.loading.set(false);
        },
      });
  }

  confirmPresence(): void {
    if (!this._participantId) return;
    this.isConfirming.set(true);

    this.consultationService
      .confirmParticipantPresence(String(this._participantId), true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isConfirming.set(false);
          this.toasterService.show(
            'success',
            this.t.instant('confirmPresenceModal.confirmSuccess'),
            this.t.instant('confirmPresenceModal.confirmSuccessMessage')
          );
          this.presenceConfirmed.emit();
          this.onClose();
        },
        error: () => {
          this.isConfirming.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('confirmPresenceModal.confirmError'),
            this.t.instant('confirmPresenceModal.confirmErrorMessage')
          );
        },
      });
  }

  declinePresence(): void {
    if (!this._participantId) return;
    this.isDeclining.set(true);

    this.consultationService
      .confirmParticipantPresence(String(this._participantId), false)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isDeclining.set(false);
          this.toasterService.show(
            'warning',
            this.t.instant('confirmPresenceModal.declineSuccess'),
            this.t.instant('confirmPresenceModal.declineSuccessMessage')
          );
          this.presenceConfirmed.emit();
          this.onClose();
        },
        error: () => {
          this.isDeclining.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('confirmPresenceModal.declineError'),
            this.t.instant('confirmPresenceModal.declineErrorMessage')
          );
        },
      });
  }

  onClose(): void {
    this.closed.emit();
  }

  getDoctorName(): string {
    const p = this.participant();
    if (!p?.appointment?.created_by) return '';
    const cb = p.appointment.created_by;
    return `${cb.first_name || ''} ${cb.last_name || ''}`.trim();
  }

  getParticipantName(participant: Participant): string {
    if (participant.user) {
      const firstName = participant.user.first_name || '';
      const lastName = participant.user.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      return (
        fullName ||
        participant.user.email ||
        this.t.instant('confirmPresenceModal.unknownParticipant')
      );
    }
    return this.t.instant('confirmPresenceModal.unknownParticipant');
  }

  getParticipantStatusColor(status: ParticipantStatus | undefined): string {
    switch (status) {
      case 'confirmed':
        return 'var(--emerald-500)';
      case 'invited':
        return 'var(--blue-500)';
      case 'unavailable':
        return 'var(--rose-500)';
      case 'cancelled':
        return 'var(--slate-400)';
      case 'draft':
        return 'var(--amber-500)';
      default:
        return 'var(--slate-500)';
    }
  }

  getParticipantStatusLabel(status: ParticipantStatus | undefined): string {
    switch (status) {
      case 'confirmed':
        return this.t.instant('confirmPresenceModal.statusConfirmed');
      case 'invited':
        return this.t.instant('confirmPresenceModal.statusPending');
      case 'unavailable':
        return this.t.instant('confirmPresenceModal.statusDeclined');
      case 'cancelled':
        return this.t.instant('confirmPresenceModal.statusCancelled');
      case 'draft':
        return this.t.instant('confirmPresenceModal.statusDraft');
      default:
        return this.t.instant('confirmPresenceModal.unknownParticipant');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

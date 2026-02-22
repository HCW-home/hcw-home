import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import {
  Participant,
  CreateParticipantRequest,
} from '../../../core/models/consultation';
import { TranslationService } from '../../../core/services/translation.service';
import { ToasterService } from '../../../core/services/toaster.service';

import { Svg } from '../../ui-components/svg/svg';
import { Button } from '../../ui-components/button/button';
import { Badge } from '../badge/badge';
import { UserAvatar } from '../user-avatar/user-avatar';
import { ModalComponent } from '../modal/modal.component';
import {
  ButtonStyleEnum,
  ButtonSizeEnum,
  ButtonStateEnum,
} from '../../constants/button';
import { BadgeTypeEnum } from '../../constants/badge';
import { getParticipantBadgeType } from '../../tools/helper';

@Component({
  selector: 'app-participant-item',
  templateUrl: './participant-item.html',
  styleUrl: './participant-item.scss',
  imports: [
    CommonModule,
    Svg,
    Button,
    Badge,
    UserAvatar,
    ModalComponent,
    TranslatePipe,
  ],
})
export class ParticipantItem {
  private t = inject(TranslationService);
  private toasterService = inject(ToasterService);

  @Input() participant: Participant | null = null;
  @Input() pendingParticipant: CreateParticipantRequest | null = null;
  @Input() showRemoveAction = false;
  @Input() isPending = false;

  @Output() remove = new EventEmitter<void>();

  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStateEnum = ButtonStateEnum;
  protected readonly BadgeTypeEnum = BadgeTypeEnum;
  protected readonly getParticipantBadgeType = getParticipantBadgeType;

  getInitials(): string {
    if (this.participant?.user) {
      const first = this.participant.user.first_name?.charAt(0) || '';
      const last = this.participant.user.last_name?.charAt(0) || '';
      if (first || last) {
        return (first + last).toUpperCase();
      }
      if (this.participant.user.email) {
        return this.participant.user.email.charAt(0).toUpperCase();
      }
    }

    if (this.pendingParticipant) {
      const first = this.pendingParticipant.first_name?.charAt(0) || '';
      const last = this.pendingParticipant.last_name?.charAt(0) || '';
      if (first || last) {
        return (first + last).toUpperCase();
      }
      if (this.pendingParticipant.email) {
        return this.pendingParticipant.email.charAt(0).toUpperCase();
      }
    }

    return '?';
  }

  getDisplayName(): string {
    if (this.participant?.user) {
      const fullName =
        `${this.participant.user.first_name || ''} ${this.participant.user.last_name || ''}`.trim();
      return (
        fullName ||
        this.participant.user.email ||
        this.t.instant('participantItem.unknown')
      );
    }

    if (this.pendingParticipant) {
      const name =
        `${this.pendingParticipant.first_name || ''} ${this.pendingParticipant.last_name || ''}`.trim();
      return (
        name ||
        this.pendingParticipant.email ||
        this.t.instant('participantItem.participant')
      );
    }

    return this.t.instant('participantItem.unknown');
  }

  getContact(): string {
    if (this.participant?.user) {
      return (
        this.participant.user.email ||
        this.participant.user.mobile_phone_number ||
        ''
      );
    }

    if (this.pendingParticipant) {
      return (
        this.pendingParticipant.email ||
        this.pendingParticipant.mobile_phone_number ||
        ''
      );
    }

    return '';
  }

  isOnline(): boolean {
    return this.participant?.user?.is_online === true;
  }

  getLanguageLabel(code: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      de: 'German',
      fr: 'French',
    };
    return languages[code] || code;
  }

  onRemove(): void {
    this.remove.emit();
  }

  getAvatarImage(): string {
    return this.participant?.user?.picture || '';
  }

  getFirstName(): string {
    return (
      this.participant?.user?.first_name ||
      this.pendingParticipant?.first_name ||
      ''
    );
  }

  getLastName(): string {
    return (
      this.participant?.user?.last_name ||
      this.pendingParticipant?.last_name ||
      ''
    );
  }

  getEmail(): string {
    return (
      this.participant?.user?.email || this.pendingParticipant?.email || ''
    );
  }

  getStatusTranslationKey(): string {
    const status = this.participant?.status;
    const map: Record<string, string> = {
      draft: 'participantItem.statusDraft',
      invited: 'participantItem.statusInvited',
      confirmed: 'participantItem.statusConfirmed',
      unavailable: 'participantItem.statusUnavailable',
      cancelled: 'participantItem.statusCancelled',
    };
    return status ? map[status] || status : '';
  }

  showLinkModal = signal(false);
  linkCopied = signal(false);

  hasAuthToken(): boolean {
    return !!this.participant?.user?.one_time_auth_token;
  }

  getInviteLink(): string {
    const token = this.participant?.user?.one_time_auth_token;
    if (!token) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/verify-invite?token=${token}`;
  }

  openLinkModal(): void {
    this.linkCopied.set(false);
    this.showLinkModal.set(true);
  }

  closeLinkModal(): void {
    this.showLinkModal.set(false);
  }

  copyLink(): void {
    const link = this.getInviteLink();
    navigator.clipboard.writeText(link).then(() => {
      this.linkCopied.set(true);
      this.toasterService.show(
        'success',
        this.t.instant('participantItem.linkCopied')
      );
    });
  }
}

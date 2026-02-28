import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Typography } from '../../ui-components/typography/typography';
import { LabelValue } from '../../ui-components/label-value/label-value';
import { TypographyTypeEnum } from '../../constants/typography';
import { Consultation } from '../../../core/models/consultation';
import { BadgeType } from '../../models/badge';
import { BadgeTypeEnum } from '../../constants/badge';

@Component({
  selector: 'app-consultation-row-item',
  imports: [DatePipe, Typography, LabelValue, TranslatePipe],
  templateUrl: './consultation-row-item.html',
  styleUrl: './consultation-row-item.scss',
})
export class ConsultationRowItem {
  consultation = input.required<Consultation>();
  showClosedDate = input<boolean>(false);
  showDescription = input<boolean>(true);
  rowClick = output<Consultation>();
  statusBadgeType = input<BadgeType>(BadgeTypeEnum.green);
  statusLabel = input<string>('Active');
  protected readonly TypographyTypeEnum = TypographyTypeEnum;

  onClick(): void {
    this.rowClick.emit(this.consultation());
  }

  getBeneficiaryName(): string {
    const beneficiary = this.consultation().beneficiary;
    if (!beneficiary) return '-';
    return this.formatUserName(beneficiary) || '-';
  }

  getOwnerName(): string {
    const owner = this.consultation().owned_by;
    if (!owner) return '-';
    return this.formatUserName(owner) || '-';
  }

  getCreatedByName(): string {
    const creator = this.consultation().created_by;
    if (!creator) return '-';
    return this.formatUserName(creator) || '-';
  }

  private formatUserName(user: { first_name: string; last_name: string; email: string }): string {
    const fullName = `${user.first_name?.trim() || ''} ${user.last_name?.trim() || ''}`.trim();
    return fullName || user.email || '';
  }

  getFormattedId(): string {
    return `#${String(this.consultation().id).padStart(6, '0')}`;
  }
}

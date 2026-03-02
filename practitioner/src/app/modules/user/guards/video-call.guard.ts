import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConsultationDetail } from '../components/consultation-detail/consultation-detail';
import { ConfirmationService } from '../../../core/services/confirmation.service';
import { TranslationService } from '../../../core/services/translation.service';

export const canDeactivateVideoCall: CanDeactivateFn<ConsultationDetail> = (component) => {
  // If not in a video call, allow navigation
  if (!component.inCall()) {
    return true;
  }

  // If in a video call, ask for confirmation
  const confirmationService = inject(ConfirmationService);
  const t = inject(TranslationService);

  return confirmationService.confirm({
    title: t.instant('videoCall.leaveCallTitle'),
    message: t.instant('videoCall.leaveCallMessage'),
    confirmText: t.instant('videoCall.leaveCallConfirm'),
    cancelText: t.instant('videoCall.leaveCallCancel'),
    confirmStyle: 'danger',
  });
};

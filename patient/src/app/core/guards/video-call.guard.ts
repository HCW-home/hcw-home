import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { VideoConsultationPage } from '../../pages/video-consultation/video-consultation.page';
import { TranslationService } from '../services/translation.service';

export const canDeactivateVideoCall: CanDeactivateFn<VideoConsultationPage> = async (component) => {
  // If not in a video call, allow navigation
  if (component.phase() !== 'in-call') {
    return true;
  }

  // If in a video call, ask for confirmation using Ionic AlertController
  const alertCtrl = inject(AlertController);
  const t = inject(TranslationService);

  return new Promise<boolean>(async (resolve) => {
    const alert = await alertCtrl.create({
      header: t.instant('videoCall.leaveCallTitle'),
      message: t.instant('videoCall.leaveCallMessage'),
      buttons: [
        {
          text: t.instant('videoCall.leaveCallCancel'),
          role: 'cancel',
          handler: () => resolve(false)
        },
        {
          text: t.instant('videoCall.leaveCallConfirm'),
          role: 'destructive',
          handler: () => resolve(true)
        }
      ]
    });

    await alert.present();
  });
};

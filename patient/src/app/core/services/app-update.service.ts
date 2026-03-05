import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { ToastController } from '@ionic/angular/standalone';
import { TranslationService } from './translation.service';
import { filter, first, switchMap, interval, concat } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AppUpdateService {
  constructor(
    private swUpdate: SwUpdate,
    private toastController: ToastController,
    private translationService: TranslationService,
    private appRef: ApplicationRef
  ) {}

  initialize(): void {
    if (!this.swUpdate.isEnabled) {
      console.log('Service Worker is not enabled');
      return;
    }

    // Check for updates when app becomes stable
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable === true)
    );

    // Check for updates every 6 hours
    const everySixHours$ = interval(6 * 60 * 60 * 1000);
    const everySixHoursOnceAppIsStable$ = concat(appIsStable$, everySixHours$);

    everySixHoursOnceAppIsStable$.subscribe(() => {
      this.swUpdate.checkForUpdate().then(updateFound => {
        if (updateFound) {
          console.log('Update check: new version found');
        }
      });
    });

    // Listen for version updates
    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe(async (evt) => {
        console.log('New version available', evt);
        await this.showUpdateNotification();
      });

    // Handle unrecoverable state
    this.swUpdate.unrecoverable.subscribe(event => {
      console.error('Unrecoverable state:', event.reason);
      this.showUnrecoverableNotification();
    });
  }

  private async showUpdateNotification(): Promise<void> {
    const toast = await this.toastController.create({
      message: this.translationService.instant('common.newVersionAvailable'),
      duration: 0,
      position: 'bottom',
      color: 'primary',
      buttons: [
        {
          text: this.translationService.instant('common.update'),
          role: 'info',
          handler: () => {
            this.activateUpdate();
          }
        },
        {
          text: this.translationService.instant('common.later'),
          role: 'cancel'
        }
      ]
    });

    await toast.present();
  }

  private async showUnrecoverableNotification(): Promise<void> {
    const toast = await this.toastController.create({
      message: this.translationService.instant('common.appNeedsReload'),
      duration: 0,
      position: 'bottom',
      color: 'danger',
      buttons: [
        {
          text: this.translationService.instant('common.reload'),
          role: 'info',
          handler: () => {
            window.location.reload();
          }
        }
      ]
    });

    await toast.present();
  }

  private activateUpdate(): void {
    this.swUpdate.activateUpdate().then(() => {
      window.location.reload();
    });
  }

  async checkForUpdates(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      return await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return false;
    }
  }
}

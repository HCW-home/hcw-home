import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslateService } from '@ngx-translate/core';
import { filter, first, switchMap, interval, concat } from 'rxjs';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class AppUpdateService {
  constructor(
    private swUpdate: SwUpdate,
    private toastService: ToastService,
    private translate: TranslateService,
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
    const message = this.translate.instant('common.newVersionAvailable');
    const updateButton = this.translate.instant('common.update');
    const laterButton = this.translate.instant('common.later');

    this.toastService.show({
      message,
      type: 'info',
      duration: 0,
      actions: [
        {
          text: updateButton,
          onClick: () => {
            this.activateUpdate();
          }
        },
        {
          text: laterButton,
          onClick: () => {}
        }
      ]
    });
  }

  private async showUnrecoverableNotification(): Promise<void> {
    const message = this.translate.instant('common.appNeedsReload');
    const reloadButton = this.translate.instant('common.reload');

    this.toastService.show({
      message,
      type: 'error',
      duration: 0,
      actions: [
        {
          text: reloadButton,
          onClick: () => {
            window.location.reload();
          }
        }
      ]
    });
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

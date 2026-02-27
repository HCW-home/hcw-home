import { Injectable, inject, Optional, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PushNotificationService {
  private http = inject(HttpClient);
  private swPush: SwPush | null;
  private vapidPublicKey: string | null = null;

  constructor(@Optional() @Inject(SwPush) swPush: SwPush | null) {
    this.swPush = swPush;
  }

  get isSupported(): boolean {
    return !!this.swPush?.isEnabled;
  }

  setVapidPublicKey(key: string): void {
    this.vapidPublicKey = key;
  }

  async subscribe(): Promise<boolean> {
    if (!this.swPush || !this.isSupported || !this.vapidPublicKey) {
      return false;
    }

    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: this.vapidPublicKey,
      });

      const json = subscription.toJSON();
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/user/webpush/subscribe/`, {
          endpoint: json.endpoint,
          p256dh: json.keys?.['p256dh'] ?? '',
          auth: json.keys?.['auth'] ?? '',
          browser: navigator.userAgent.substring(0, 100),
        })
      );

      return true;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return false;
    }
  }

  async unsubscribe(): Promise<void> {
    if (!this.swPush || !this.isSupported) return;

    try {
      const sub = await firstValueFrom(this.swPush.subscription);
      if (sub) {
        const json = sub.toJSON() as PushSubscriptionJSON;
        await firstValueFrom(
          this.http.post(`${environment.apiUrl}/user/webpush/unsubscribe/`, {
            endpoint: json.endpoint,
          })
        );
      }
      await this.swPush.unsubscribe();
    } catch (error) {
      console.error('Push unsubscription failed:', error);
    }
  }
}

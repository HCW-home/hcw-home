import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonText,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  NavController,
  ToastController
} from '@ionic/angular/standalone';
import { AppHeaderComponent } from '../../shared/app-header/app-header.component';
import { AppFooterComponent } from '../../shared/app-footer/app-footer.component';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';
import { INotification, NotificationStatus } from '../../core/models/notification.model';
import { UserWebSocketService } from '../../core/services/user-websocket.service';
import { ActionHandlerService } from '../../core/services/action-handler.service';
import { ConsultationService } from '../../core/services/consultation.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../core/services/translation.service';

interface DisplayNotification {
  id: number;
  title: string;
  message: string;
  icon: string;
  color: string;
  time: string;
  isRead: boolean;
  type: 'appointment' | 'message' | 'health' | 'system';
  senderName: string | null;
  objectModel: string | null;
  objectPk: number | null;
  actionLabel: string | null;
  accessLink: string | null;
}

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonText,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    AppHeaderComponent,
    AppFooterComponent,
    TranslatePipe
  ]
})
export class NotificationsPage implements OnInit, OnDestroy {
  notifications: DisplayNotification[] = [];
  isLoading = true;
  private subscriptions: Subscription[] = [];
  private t = inject(TranslationService);

  constructor(
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private notificationService: NotificationService,
    private userWs: UserWebSocketService,
    private actionHandler: ActionHandlerService,
    private consultationService: ConsultationService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadNotifications();
    this.setupRealtimeNotifications();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadNotifications(event?: { target: { complete: () => void } }): void {
    this.isLoading = !event;
    this.notificationService.getNotifications().subscribe({
      next: (response) => {
        this.notifications = response.results.map(n => this.mapNotification(n));
        this.isLoading = false;
        event?.target.complete();
      },
      error: () => {
        this.isLoading = false;
        event?.target.complete();
      }
    });
  }

  private setupRealtimeNotifications(): void {
    const sub = this.userWs.notifications$.subscribe(event => {
      const data = event.data;
      const notification: INotification = {
        id: Date.now(),
        subject: (data['title'] as string) || this.t.instant('notifications.newNotification'),
        content: (data['message'] as string) || '',
        communication_method: 'push',
        status: NotificationStatus.PENDING,
        sent_at: null,
        delivered_at: null,
        read_at: null,
        failed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sent_by: null,
        object_model: null,
        object_pk: null,
        access_link: null,
        action_label: null
      };
      this.notifications.unshift(this.mapNotification(notification));
    });
    this.subscriptions.push(sub);
  }

  private mapNotification(n: INotification): DisplayNotification {
    const type = this.determineType(n);
    const sender = n.sent_by;
    return {
      id: n.id,
      title: n.subject || this.t.instant('notifications.notification'),
      message: n.content || '',
      icon: this.getIconForType(type),
      color: this.getColorForType(type),
      time: this.formatTime(n.created_at),
      isRead: n.status === NotificationStatus.READ,
      type,
      senderName: sender ? `${sender.first_name} ${sender.last_name}`.trim() : null,
      objectModel: n.object_model || null,
      objectPk: n.object_pk || null,
      actionLabel: n.action_label || null,
      accessLink: n.access_link || null
    };
  }

  private determineType(n: INotification): 'appointment' | 'message' | 'health' | 'system' {
    if (n.object_model) {
      const model = n.object_model.toLowerCase();
      if (model.includes('participant')) return 'appointment';
      if (model.includes('message')) return 'message';
      if (model.includes('user')) return 'system';
    }

    const title = (n.subject || '').toLowerCase();
    if (title.includes('appointment') || title.includes('schedule')) {
      return 'appointment';
    } else if (title.includes('message')) {
      return 'message';
    } else if (title.includes('health') || title.includes('test') || title.includes('prescription')) {
      return 'health';
    }
    return 'system';
  }

  private getIconForType(type: string): string {
    switch (type) {
      case 'appointment': return 'calendar';
      case 'message': return 'mail';
      case 'health': return 'medkit';
      default: return 'information-circle';
    }
  }

  private getColorForType(type: string): string {
    switch (type) {
      case 'appointment': return 'primary';
      case 'message': return 'secondary';
      case 'health': return 'success';
      default: return 'warning';
    }
  }

  private formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return this.t.instant('notifications.justNow');
    if (minutes < 60) return this.t.instant('notifications.minAgo', { count: String(minutes) });
    if (hours < 24) return hours === 1
      ? this.t.instant('notifications.hourAgo', { count: String(hours) })
      : this.t.instant('notifications.hoursAgo', { count: String(hours) });
    if (days === 1) return this.t.instant('notifications.yesterday');
    if (days < 7) return this.t.instant('notifications.daysAgo', { count: String(days) });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  async markAllAsRead() {
    const unreadNotifications = this.notifications.filter(n => !n.isRead);
    if (unreadNotifications.length === 0) {
      return;
    }

    this.notifications.forEach(n => n.isRead = true);
    this.notificationService.markAllAsRead().subscribe({
      next: async () => {
        const toast = await this.toastCtrl.create({
          message: this.t.instant('notifications.markedAllRead'),
          duration: 2000,
          position: 'top',
          color: 'success'
        });
        await toast.present();
      },
      error: async () => {
        const toast = await this.toastCtrl.create({
          message: this.t.instant('notifications.failedMarkRead'),
          duration: 2000,
          position: 'top',
          color: 'danger'
        });
        await toast.present();
      }
    });
  }

  async onNotificationClick(notification: DisplayNotification) {
    if (!notification.isRead) {
      notification.isRead = true;
      this.notificationService.markAsRead(notification.id).subscribe();
    }

    let action: string | null = null;
    let id: string | null = null;
    let email: string | null = null;

    if (notification.accessLink) {
      try {
        const url = new URL(notification.accessLink);
        action = url.searchParams.get('action');
        id = url.searchParams.get('id');
        email = url.searchParams.get('email');
      } catch { /* invalid URL, fall through */ }
    }

    if (email) {
      const currentUser = this.authService.currentUserValue;
      if (currentUser && currentUser.email !== email) {
        const toast = await this.toastCtrl.create({
          message: this.t.instant('notifications.intendedFor', { email }),
          duration: 3000,
          position: 'top',
          color: 'warning'
        });
        await toast.present();
      }
    }

    if (action === 'join' && id) {
      this.consultationService.getParticipantById(Number(id)).subscribe({
        next: (participant) => {
          const consultation = participant.appointment.consultation;
          const consultationId = typeof consultation === 'object' ? (consultation as {id: number}).id : consultation;
          this.navCtrl.navigateForward(
            `/consultation/${participant.appointment.id}/video`,
            { queryParams: { type: 'appointment', consultationId } }
          );
        },
        error: () => {
          this.navCtrl.navigateForward(`/confirm-presence/${id}`);
        }
      });
      return;
    }

    if (action && id) {
      const actionRoute = this.actionHandler.getRouteWithParams(action, id);
      this.navCtrl.navigateForward(actionRoute.path, { queryParams: actionRoute.queryParams });
      return;
    }

  }

  dismissNotification(notification: DisplayNotification) {
    const index = this.notifications.indexOf(notification);
    if (index > -1) {
      this.notifications.splice(index, 1);
    }
  }

  refreshNotifications(event: { target: { complete: () => void } }) {
    this.loadNotifications(event);
  }
}

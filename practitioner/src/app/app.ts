import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToasterContainerComponent } from './core/components/toaster-container/toaster-container.component';
import { OfflineIndicatorComponent } from './core/components/offline-indicator.component';
import { Confirmation } from './shared/components/confirmation/confirmation';
import { Auth } from './core/services/auth';
import { TranslationService } from './core/services/translation.service';
import { UserWebSocketService } from './core/services/user-websocket.service';
import { ActionHandlerService } from './core/services/action-handler.service';
import { IncomingCallService } from './core/services/incoming-call.service';
import { BrowserNotificationService } from './core/services/browser-notification.service';
import { PushNotificationService } from './core/services/push-notification.service';
import { ConsultationService } from './core/services/consultation.service';
import { AppUpdateService } from './core/services/app-update.service';
import { RoutePaths } from './core/constants/routes';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToasterContainerComponent, OfflineIndicatorComponent, Confirmation],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected title = 'practitioner';
  private destroy$ = new Subject<void>();

  constructor(
    private authService: Auth,
    private translationService: TranslationService,
    private userWsService: UserWebSocketService,
    private actionHandler: ActionHandlerService,
    private incomingCallService: IncomingCallService,
    private browserNotificationService: BrowserNotificationService,
    private pushNotificationService: PushNotificationService,
    private consultationService: ConsultationService,
    private appUpdateService: AppUpdateService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.handleDeepLinks();
    this.setupWebSocketSubscriptions();
    this.loadVapidKey();
    this.appUpdateService.initialize();

    this.authService.isAuthenticated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isAuthenticated: boolean) => {
        if (isAuthenticated) {
          this.userWsService.connect();
          this.browserNotificationService.requestPermission();
          this.pushNotificationService.subscribe();
        } else {
          this.userWsService.disconnect();
        }
      });
  }

  private loadVapidKey(): void {
    this.authService.getOpenIDConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe((config: any) => {
        if (config?.vapid_public_key) {
          this.pushNotificationService.setVapidPublicKey(config.vapid_public_key);
        }
      });
  }

  private setupWebSocketSubscriptions(): void {
    this.userWsService.appointmentJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.incomingCallService.showIncomingCall({
          callerName: event.data.user_name,
          appointmentId: event.appointment_id,
          consultationId: event.consultation_id,
        });
      });

  }

  private handleDeepLinks(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth');
    const action = urlParams.get('action');
    const id = urlParams.get('id');
    const email = urlParams.get('email');
    const uid = urlParams.get('uid');
    const token = urlParams.get('token');

    if (action === 'reset' && uid && token) {
      this.router.navigate([`/${RoutePaths.AUTH}`, 'reset', uid, token], { replaceUrl: true });
      return;
    }

    if (authToken) {
      this.router.navigate([`/${RoutePaths.VERIFY_INVITE}`], {
        queryParams: { auth: authToken, action, id }
      });
    } else if (email) {
      this.router.navigate([`/${RoutePaths.AUTH}`], {
        queryParams: { email, action, id }
      });
    } else if (action && id) {
      if (action === 'join') {
        this.consultationService.getParticipantById(id).subscribe({
          next: (participant) => {
            const consultation = participant.appointment.consultation;
            const consultationId = typeof consultation === 'object' ? (consultation as {id: number}).id : consultation;
            this.router.navigate(
              ['/', RoutePaths.USER, RoutePaths.CONSULTATIONS, consultationId],
              { queryParams: { join: 'true', appointmentId: participant.appointment.id } }
            );
          },
          error: () => {
            this.router.navigate(['/', RoutePaths.CONFIRM_PRESENCE, id]);
          }
        });
      } else {
        const route = this.actionHandler.getRouteForAction(action, id);
        this.router.navigateByUrl(route);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.userWsService.disconnect();
  }
}

import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  viewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import {
  Router,
  NavigationEnd,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { Location } from '@angular/common';
import { RoutePaths } from '../../constants/routes';
import { MenuItems } from '../../constants/sidebar';
import { Typography } from '../../../shared/ui-components/typography/typography';
import { TypographyTypeEnum } from '../../../shared/constants/typography';
import { Svg } from '../../../shared/ui-components/svg/svg';
import { filter, Subject, takeUntil } from 'rxjs';
import { NgClass } from '@angular/common';
import { UserService } from '../../services/user.service';
import { NotificationService } from '../../services/notification.service';
import { UserWebSocketService } from '../../services/user-websocket.service';
import { Auth } from '../../services/auth';
import { BrowserNotificationService } from '../../services/browser-notification.service';
import { ActionHandlerService } from '../../services/action-handler.service';
import { ConsultationService } from '../../services/consultation.service';
import { ToasterService } from '../../services/toaster.service';
import { IUser } from '../../../modules/user/models/user';
import { INotification, NotificationStatus } from '../../models/notification';
import { Button } from '../../../shared/ui-components/button/button';
import {
  ButtonSizeEnum,
  ButtonStyleEnum,
} from '../../../shared/constants/button';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation.service';
import { CreateConsultationModal } from '../../../modules/user/components/create-consultation-modal/create-consultation-modal';

@Component({
  selector: 'app-header',
  imports: [
    Typography,
    Svg,
    NgClass,
    Button,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    CreateConsultationModal,
  ],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header implements OnInit, OnDestroy {
  protected router = inject(Router);
  private location = inject(Location);
  private userService = inject(UserService);
  protected notificationService = inject(NotificationService);
  private userWsService = inject(UserWebSocketService);
  private authService = inject(Auth);
  private browserNotificationService = inject(BrowserNotificationService);
  private actionHandler = inject(ActionHandlerService);
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private t = inject(TranslationService);
  private destroy$ = new Subject<void>();

  showProfileMenu = signal(false);
  showNotifications = signal(false);
  showMobileMenu = signal(false);
  showNewConsultationButton = signal(false);
  showOnboardingHint = signal(false);
  showCreateConsultationModal = signal(false);
  hintTop = signal(0);
  hintLeft = signal(0);
  newConsultationBtn = viewChild<ElementRef>('newConsultationBtn');
  showBackButton = signal(false);
  pageTitle = signal('Dashboard');
  pageSubtitle = signal('Welcome back');
  currentUser: IUser | null = null;
  menuItems = MenuItems;
  protected readonly RoutePaths = RoutePaths;

  protected readonly NotificationStatus = NotificationStatus;

  private handleDocumentClick = (): void => {
    if (this.showOnboardingHint()) {
      this.dismissOnboardingHint();
    }
  };

  @HostListener('document:click')
  onClickOutside(): void {
    this.showProfileMenu.set(false);
    this.showNotifications.set(false);
  }

  ngOnInit() {
    this.userService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser = user;
      });

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.updatePageInfo();
        this.checkOnboardingHint();
      });
    this.updatePageInfo();
    this.checkOnboardingHint();
    this.notificationService.loadNotifications();

    // Close onboarding hint on any click outside
    document.addEventListener('click', this.handleDocumentClick);

    this.userWsService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.notificationService.handleWebSocketNotification(event);

        if (!document.hasFocus()) {
          const plainText = event.render_content_html.replace(/<[^>]*>/g, '');
          this.browserNotificationService.showNotification(
            event.render_subject,
            plainText,
            () => {
              if (event.access_link) {
                try {
                  const url = new URL(event.access_link);
                  const action = url.searchParams.get('action');
                  const id = url.searchParams.get('id');
                  if (action === 'join' && id) {
                    this.consultationService.getParticipantById(id).subscribe({
                      next: participant => {
                        const consultation =
                          participant.appointment.consultation;
                        const consultationId =
                          typeof consultation === 'object'
                            ? (consultation as { id: number }).id
                            : consultation;
                        this.router.navigate(
                          [
                            '/',
                            RoutePaths.USER,
                            RoutePaths.CONSULTATIONS,
                            consultationId,
                          ],
                          {
                            queryParams: {
                              join: 'true',
                              appointmentId: participant.appointment.id,
                            },
                          }
                        );
                      },
                      error: () => {
                        this.router.navigate([
                          '/',
                          RoutePaths.CONFIRM_PRESENCE,
                          id,
                        ]);
                      },
                    });
                  } else if (action && id) {
                    const route = this.actionHandler.getRouteForAction(
                      action,
                      id
                    );
                    this.router.navigateByUrl(route);
                  }
                } catch {
                  /* invalid URL */
                }
              }
            }
          );
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('click', this.handleDocumentClick);
  }

  private checkOnboardingHint(): void {
    if (localStorage.getItem('show_onboarding_hint') === 'true') {
      this.showOnboardingHint.set(true);
      this.updateHintPosition();
    }
  }

  private updateHintPosition(): void {
    setTimeout(() => {
      const el = this.newConsultationBtn()?.nativeElement;
      if (el) {
        const rect = el.getBoundingClientRect();
        this.hintTop.set(rect.bottom + 12);
        this.hintLeft.set(rect.left + rect.width / 2);
      }
    });
  }

  dismissOnboardingHint(): void {
    this.showOnboardingHint.set(false);
    localStorage.removeItem('show_onboarding_hint');
  }

  private updatePageInfo() {
    const url = this.router.url;
    this.showNewConsultationButton.set(false);
    this.showBackButton.set(false);

    if (url.includes('/dashboard')) {
      this.pageTitle.set(this.t.instant('header.dashboard'));
      const name = this.getUserDisplayName();
      this.pageSubtitle.set(
        name
          ? this.t.instant('header.welcomeBack', { name })
          : this.t.instant('header.welcomeBackDefault')
      );
      this.showNewConsultationButton.set(true);
    } else if (url.includes('/consultations/new')) {
      this.pageTitle.set(this.t.instant('header.newConsultationTitle'));
      this.pageSubtitle.set(this.t.instant('header.newConsultationSubtitle'));
      this.showBackButton.set(true);
    } else if (url.includes('/consultations/')) {
      this.pageTitle.set(this.t.instant('header.consultationDetailsTitle'));
      this.pageSubtitle.set(
        this.t.instant('header.consultationDetailsSubtitle')
      );
      this.showBackButton.set(true);
    } else if (url.includes('/consultations')) {
      this.pageTitle.set(this.t.instant('header.consultationsTitle'));
      this.pageSubtitle.set(this.t.instant('header.consultationsSubtitle'));
      this.showNewConsultationButton.set(true);
    } else if (url.match(/\/patients\/\d/)) {
      this.pageTitle.set(this.t.instant('header.patientDetailTitle'));
      this.pageSubtitle.set('');
      this.showBackButton.set(true);
    } else if (url.includes('/patients')) {
      this.pageTitle.set(this.t.instant('header.patientsTitle'));
      this.pageSubtitle.set(this.t.instant('header.patientsSubtitle'));
    } else if (url.includes('/appointments')) {
      this.pageTitle.set(this.t.instant('header.appointmentsTitle'));
      this.pageSubtitle.set(this.t.instant('header.appointmentsSubtitle'));
    } else if (url.includes('/availability')) {
      this.pageTitle.set(this.t.instant('header.availabilityTitle'));
      this.pageSubtitle.set(this.t.instant('header.availabilitySubtitle'));
    } else if (url.includes('/profile')) {
      this.pageTitle.set(this.t.instant('header.profileTitle'));
      this.pageSubtitle.set(this.t.instant('header.profileSubtitle'));
      this.showBackButton.set(true);
    } else if (url.includes('/test')) {
      this.pageTitle.set(this.t.instant('header.systemTestTitle'));
      this.pageSubtitle.set(this.t.instant('header.systemTestSubtitle'));
    }
  }

  navigateToNewConsultation() {
    this.closeMobileMenu();
    this.showCreateConsultationModal.set(true);
  }

  closeCreateConsultationModal() {
    this.showCreateConsultationModal.set(false);
  }

  goBack() {
    this.location.back();
  }

  getUserDisplayName(): string {
    if (!this.currentUser) return '';
    if (this.currentUser.first_name || this.currentUser.last_name) {
      return `${this.currentUser.first_name || ''} ${this.currentUser.last_name || ''}`.trim();
    }
    return this.currentUser.email?.split('@')[0] || '';
  }

  getUserInitials(): string {
    if (!this.currentUser) return '';
    if (this.currentUser.first_name && this.currentUser.last_name) {
      return `${this.currentUser.first_name[0]}${this.currentUser.last_name[0]}`.toUpperCase();
    }
    return this.currentUser.email?.substring(0, 2).toUpperCase() || '';
  }

  getUserPicture(): string {
    return this.currentUser?.picture || '';
  }

  toggleProfileMenu() {
    this.showProfileMenu.update(v => !v);
    if (this.showProfileMenu()) {
      this.showMobileMenu.set(false);
    }
  }

  closeProfileMenu() {
    this.showProfileMenu.set(false);
  }

  toggleMobileMenu() {
    this.showMobileMenu.update(v => !v);
    if (this.showMobileMenu()) {
      this.showProfileMenu.set(false);
      this.showNotifications.set(false);
    }
  }

  closeMobileMenu() {
    this.showMobileMenu.set(false);
  }

  openProfile() {
    this.closeProfileMenu();
    this.closeMobileMenu();
    this.router.navigate([RoutePaths.USER, RoutePaths.PROFILE]);
  }

  async onLogout() {
    this.closeProfileMenu();
    this.closeMobileMenu();
    this.userWsService.disconnect();
    this.userService.clearCurrentUser();
    const savedLanguage = localStorage.getItem('app_language');
    await this.authService.logout();
    localStorage.clear();
    if (savedLanguage) {
      localStorage.setItem('app_language', savedLanguage);
    }
    this.router.navigate([RoutePaths.AUTH]);
  }

  toggleNotifications() {
    this.showNotifications.update(v => !v);
    if (this.showNotifications()) {
      this.showProfileMenu.set(false);
    }
  }

  closeNotifications() {
    this.showNotifications.set(false);
  }

  markAllNotificationsRead() {
    this.notificationService.markAllAsRead().subscribe();
  }

  loadMoreNotifications() {
    this.notificationService.loadMore();
  }

  onNotificationClick(notification: INotification) {
    if (notification.status !== NotificationStatus.READ) {
      this.notificationService.markAsRead(notification.id).subscribe();
    }
    this.closeNotifications();

    let action: string | null = null;
    let id: string | null = null;
    let email: string | null = null;
    let model: string | null = null;

    if (notification.access_link) {
      try {
        const url = new URL(notification.access_link);
        action = url.searchParams.get('action');
        id = url.searchParams.get('id');
        email = url.searchParams.get('email');
        model = url.searchParams.get('model');
      } catch {
        /* invalid URL, fall through */
      }
    }

    if (email && this.currentUser && this.currentUser.email !== email) {
      this.toasterService.show(
        'warning',
        this.t.instant('header.emailMismatch'),
        this.t.instant('header.emailMismatchMessage', { email })
      );
    }

    if (action === 'join' && id) {
      this.consultationService.getParticipantById(id).subscribe({
        next: participant => {
          const consultation = participant.appointment.consultation;
          const consultationId =
            typeof consultation === 'object'
              ? (consultation as { id: number }).id
              : consultation;
          this.router.navigate(
            ['/', RoutePaths.USER, RoutePaths.CONSULTATIONS, consultationId],
            {
              queryParams: {
                join: 'true',
                appointmentId: participant.appointment.id,
              },
            }
          );
        },
        error: () => {
          this.router.navigate(['/', RoutePaths.CONFIRM_PRESENCE, id]);
        },
      });
      return;
    }

    if (action === 'message' && id && model === 'consultations.Participant') {
      this.consultationService.getParticipantById(id).subscribe({
        next: participant => {
          const consultation = participant.appointment.consultation;
          const consultationId =
            typeof consultation === 'object'
              ? (consultation as { id: number }).id
              : consultation;
          this.router.navigate([
            '/',
            RoutePaths.USER,
            RoutePaths.CONSULTATIONS,
            consultationId,
          ]);
        },
        error: () => {
          this.router.navigate([
            '/',
            RoutePaths.USER,
            RoutePaths.CONSULTATIONS,
          ]);
        },
      });
      return;
    }

    if (action && id) {
      const route = this.actionHandler.getRouteForAction(action, id);
      this.router.navigateByUrl(route);
      return;
    }
  }

  isNotificationUnread(notification: INotification): boolean {
    return (
      notification.status !== NotificationStatus.READ &&
      notification.read_at === null
    );
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
}

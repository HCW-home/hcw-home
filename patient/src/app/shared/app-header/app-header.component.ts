import { Component, OnInit, OnDestroy, Input, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonBackButton,
  NavController,
} from "@ionic/angular/standalone";
import { Subject, takeUntil } from "rxjs";
import { AuthService } from "../../core/services/auth.service";
import { NotificationService } from "../../core/services/notification.service";
import { User } from "../../core/models/user.model";

@Component({
  selector: "app-header",
  templateUrl: "./app-header.component.html",
  styleUrls: ["./app-header.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonBackButton,
  ],
})
export class AppHeaderComponent implements OnInit, OnDestroy {
  @Input() pageTitle?: string;
  @Input() showBackButton = false;
  @Input() backHref = "/home";

  private destroy$ = new Subject<void>();

  currentUser = signal<User | null>(null);
  branding = signal<string>("HCW");
  siteLogo = signal<string | null>(null);
  unreadNotificationCount = signal(0);

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private navCtrl: NavController,
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => this.currentUser.set(user));

    this.authService
      .getConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (config: any) => {
          if (config?.branding) {
            this.branding.set(config.branding);
          }
          if (config?.main_organization?.logo_color) {
            this.siteLogo.set(config.main_organization.logo_color);
          }
        },
      });

    this.notificationService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe((count) => this.unreadNotificationCount.set(count));

    this.notificationService.loadInitialUnreadCount();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getUserFullName(): string {
    const user = this.currentUser();
    if (user) {
      const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      return name || '';
    }
    return '';
  }

  getUserInitials(): string {
    const user = this.currentUser();
    if (user) {
      const first = user.first_name?.charAt(0) || "";
      const last = user.last_name?.charAt(0) || "";
      return (first + last).toUpperCase() || "U";
    }
    return "U";
  }

  getUserPicture(): string {
    return this.currentUser()?.picture || "";
  }

  goToNotifications(): void {
    this.navCtrl.navigateForward("/notifications");
  }

  goToProfile(): void {
    this.navCtrl.navigateForward("/profile");
  }
}

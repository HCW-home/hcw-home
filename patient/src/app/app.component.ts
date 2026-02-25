import { Component, OnInit, OnDestroy, inject } from "@angular/core";
import {
  IonApp,
  IonRouterOutlet,
  NavController,
} from "@ionic/angular/standalone";
import { Title } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { Subject, takeUntil } from "rxjs";
import { AuthService } from "./core/services/auth.service";
import { UserWebSocketService } from "./core/services/user-websocket.service";
import { IncomingCallService } from "./core/services/incoming-call.service";
import { ActionHandlerService } from "./core/services/action-handler.service";
import { ConsultationService } from "./core/services/consultation.service";
import { IncomingCallComponent } from "./shared/components/incoming-call/incoming-call.component";
import { TranslationService } from "./core/services/translation.service";

@Component({
  selector: "app-root",
  templateUrl: "app.component.html",
  styleUrls: ["app.component.scss"],
  imports: [IonApp, IonRouterOutlet, IncomingCallComponent],
})
export class AppComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private titleService = inject(Title);
  private translationService = inject(TranslationService);

  constructor(
    private authService: AuthService,
    private userWsService: UserWebSocketService,
    private incomingCallService: IncomingCallService,
    private actionHandler: ActionHandlerService,
    private consultationService: ConsultationService,
    private navCtrl: NavController,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.handleDeepLinks();
    this.setupWebSocketSubscriptions();
    this.loadBranding();

    this.authService.isAuthenticated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isAuthenticated: boolean) => {
        if (isAuthenticated) {
          this.userWsService.connect();
        } else {
          this.userWsService.disconnect();
        }
      });
  }

  private setupWebSocketSubscriptions(): void {
    this.userWsService.appointmentJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        // Don't show incoming call if already on video consultation page
        if (this.router.url.includes("/video")) {
          return;
        }

        this.incomingCallService.showIncomingCall({
          callerName: event.data.user_name,
          appointmentId: event.appointment_id,
          consultationId: event.consultation_id,
        });
      });
  }

  private handleDeepLinks(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get("auth");
    const action = urlParams.get("action");
    const actionId = urlParams.get("id");
    const email = urlParams.get("email");
    const uid = urlParams.get("uid");
    const token = urlParams.get("token");

    if (action === "verify-email" && token) {
      this.navCtrl.navigateRoot(["/verify-email"], {
        queryParams: { token },
      });
    } else if (uid && token) {
      this.navCtrl.navigateRoot(["/reset-password"], {
        queryParams: { uid, token },
      });
    } else if (authToken) {
      const queryParams: Record<string, string> = { auth: authToken };
      if (action) queryParams["action"] = action;
      if (actionId) queryParams["id"] = actionId;
      this.navCtrl.navigateRoot(["/verify-invite"], { queryParams });
    } else if (email) {
      this.navCtrl.navigateRoot(["/login"], {
        queryParams: { email, action, id: actionId },
      });
    } else if (action && actionId) {
      if (action === "join") {
        this.consultationService
          .getParticipantById(Number(actionId))
          .subscribe({
            next: (participant) => {
              const consultation = participant.appointment.consultation;
              const consultationId =
                typeof consultation === "object"
                  ? (consultation as { id: number }).id
                  : consultation;
              this.navCtrl.navigateRoot(
                [`/consultation/${participant.appointment.id}/video`],
                { queryParams: { type: "appointment", consultationId } },
              );
            },
            error: () => {
              this.navCtrl.navigateRoot([`/confirm-presence/${actionId}`]);
            },
          });
      } else {
        const route = this.actionHandler.getRouteForAction(action, actionId);
        this.navCtrl.navigateRoot([route]);
      }
    }
  }

  private loadBranding(): void {
    this.authService
      .getConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (config: any) => {
          if (config?.branding) {
            this.titleService.setTitle(config.branding);
          }
          if (config?.languages?.length) {
            this.translationService.loadLanguages(config.languages);
          }
          if (config?.site_favicon) {
            const link: HTMLLinkElement =
              document.querySelector("link[rel~='icon']") ||
              document.createElement("link");
            link.rel = "icon";
            link.href = config.site_favicon;
            document.head.appendChild(link);
          }
          if (config?.primary_color_patient) {
            this.applyPrimaryColor(config.primary_color_patient);
          }
        },
      });
  }

  private applyPrimaryColor(hex: string): void {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const toHex = (v: number) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0");
    const shade = (v: number) => Math.round(v * 0.85);
    const tint = (v: number) => Math.round(v + (255 - v) * 0.3);
    const pastel = (v: number) => Math.round(v + (255 - v) * 0.95);

    const root = document.documentElement.style;
    root.setProperty("--ion-color-primary", hex);
    root.setProperty("--ion-color-primary-rgb", `${r}, ${g}, ${b}`);
    root.setProperty("--ion-color-primary-shade", `#${toHex(shade(r))}${toHex(shade(g))}${toHex(shade(b))}`);
    root.setProperty("--ion-color-primary-tint", `#${toHex(tint(r))}${toHex(tint(g))}${toHex(tint(b))}`);
    root.setProperty("--app-background", `#${toHex(pastel(r))}${toHex(pastel(g))}${toHex(pastel(b))}`);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.userWsService.disconnect();
  }
}

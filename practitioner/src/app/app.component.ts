import { Component, computed, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule, SvgIconRegistryService } from 'angular-svg-icon';
import { AuthService } from './auth/auth.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DashboardWebSocketService } from './services/dashboard-websocket.service';
import { Subscription } from 'rxjs';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { ConfirmationDialogComponent } from './components/confirmation-dialog/confirmation-dialog.component';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    AngularSvgIconModule,
    MatProgressSpinnerModule,
    ToastContainerComponent,
    ConfirmationDialogComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'practitioner';
  pendingConsultations: number | undefined = 0;
  activeConsultations: number | undefined = 0;
  loginChecked = computed(() => this.authService.loginChecked());
  isLoggedIn = computed(() => this.authService.isLoggedIn());
  private iconNames = ['warning', 'download', 'chevron-right', 'x', 'mail'];
  private dashboardSubscription?: Subscription;

  constructor(
    private iconRegistry: SvgIconRegistryService,
    private authService: AuthService,
    private dashboardWebSocketService: DashboardWebSocketService

  ) { }

  ngOnInit(): void {
    this.registerAllIcons();

    if (this.isLoggedIn()) {
      this.initializeDashboardWebSocket();
      this.subscribeToWaitingRoomUpdates();
    }
  }

  ngOnDestroy(): void {
    this.dashboardSubscription?.unsubscribe();
  }

  private initializeDashboardWebSocket(): void {
    // Initialize WebSocket connection for real-time updates
    try {
      const currentUser = this.authService.getCurrentUser();
      if (currentUser?.id) {
        this.dashboardWebSocketService.initializeDashboardConnection(currentUser.id);
        console.log('[AppComponent] Dashboard WebSocket initialized for practitioner:', currentUser.id);
      }
    } catch (error) {
      console.warn('[AppComponent] Failed to initialize dashboard WebSocket:', error);
    }
  }

  private subscribeToWaitingRoomUpdates(): void {
    this.dashboardSubscription = this.dashboardWebSocketService.dashboardState$.subscribe(state => {
      this.pendingConsultations = state.waitingPatientCount;
    });
  }

  private registerAllIcons(): void {
    this.iconNames.forEach((iconName) => {
      if (this.iconRegistry) {
        this.iconRegistry
          .loadSvg(`assets/svg/${iconName}.svg`, iconName)
          ?.subscribe({
            error: (error) =>
              console.error(`Failed to register icon ${iconName}:`, error),
          });
      }
    });
  }
}


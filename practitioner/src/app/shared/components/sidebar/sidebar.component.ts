import { Component, Input, HostListener, input, inject } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { SidebarItem } from '../../../models/sidebar';
import { BadgeComponent } from '../../../badge/badge.component';
import { AuthService } from '../../../auth/auth.service';
import { LoginUser } from '../../../models/user.model';
import { MatMenuModule } from '@angular/material/menu';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { GuidedTourModule } from 'ngx-guided-tour';
import { GuidedTourService } from '../../../services/guided-tour.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatIconModule,
    MatListModule,
    MatBadgeModule,
    MatButtonModule,
    MatTooltipModule,
    BadgeComponent,
    AngularSvgIconModule,
    MatMenuModule,
    GuidedTourModule,
  ],
})
export class SidebarComponent {
  isLoggedIn = input<boolean>(true);
  pendingConsultations = input<number | undefined>(0);
  activeConsultations = input<number | undefined>(0);
  private authService = inject(AuthService);
  private router = inject(Router);
  currentUser: LoginUser | null = null;
  showDropdown=false


  isMobile = false;
  isSidebarOpen = true;
  isSidebarVisible = true;
  sidebarItems: SidebarItem[] = [];

  constructor(private guidedTourService: GuidedTourService) {}

  ngOnInit() {
    this.checkMobileView();
    this.currentUser=this.authService.getCurrentUser()

    this.sidebarItems = [
      { icon: 'icon-dashboard.svg', label: 'Dashboard', route: '/dashboard', tourId: 'dashboard'},
      {
        icon: 'icon-queue.svg',
        label: 'Waiting Room',
        route: '/waiting-room',
        badge: this.pendingConsultations(),
        tourId: 'waiting-room'
      },
      {
        icon: 'icon-open.svg',
        label: 'Opened Consultations',
        route: '/open-consultations',
        badge: this.activeConsultations(),
        tourId: 'open-consultations'
      },
      {
        icon: 'icon-history.svg',
        label: 'Consultation history',
        route: '/closed-consultations',
        tourId: 'closed-consultations'
      },
      { icon: 'icon-invite.svg', label: 'Invites', route: '/invites', tourId: 'invites' },
      { icon: 'icon-calendar.svg', label: 'Availability', route: '/availability', tourId: 'availability' },
    ];
  }

  @HostListener('window:resize', [])
  checkMobileView() {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) {
      this.isSidebarOpen = false;
    }
  }

  toggleSidebar() {
    if (this.isMobile) {
      this.isSidebarOpen = !this.isSidebarOpen;
    } else {
      this.isSidebarVisible = !this.isSidebarVisible;
    }
  }

  closeSidebarOnMobile() {
    if (this.isMobile) {
      this.isSidebarOpen = false;
    }
  }

  getCurrentTour() {
    const currentUrl = this.router.url;
    switch (currentUrl) {
      case '/dashboard':
        return this.guidedTourService.getDashboardTour();
      case '/waiting-room':
        
      case '/profile':
        return this.guidedTourService.getProfileTour();
      case '/invites':
        
      case '/open-consultations':
      case '/consultation-detail':
        return this.guidedTourService.getConsultationDetailTour();
      default:
        return null;
    }
  }

  startTour() {
    if (!this.isMobile) {
      this.isSidebarVisible = true;
    }
    const sidebarTour = this.guidedTourService.getPractitionerTour();
    const componentTour = this.getCurrentTour();

    sidebarTour.completeCallback = () => {
      if (componentTour) {
        setTimeout(() => {
          componentTour.skipCallback = () => {
            if (this.isMobile) {
              this.isSidebarVisible = false;
            }
          };
          
          componentTour.completeCallback = () => {
            if (this.isMobile) {
              this.isSidebarVisible = false;
            }
          };

          this.guidedTourService.startTour(componentTour);
        }, 500);
      };
    }

    sidebarTour.steps[0].action = () => {
      if (this.isMobile) {
        this.isSidebarVisible = false;
      }
    };

    sidebarTour.skipCallback = () => {
      if (this.isMobile) {
        this.isSidebarVisible = false;
      }
    };
    setTimeout(() => {
      this.guidedTourService.startTour(sidebarTour);
    }, 100);
  }

  logout(){
    this.authService.logout()
  }
}

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
import { TourMatMenuModule } from 'ngx-ui-tour-md-menu';
import { GuidedTourService } from '../../../services/guided-tour.service';
import { TourType } from '../../../models/tour';

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
    TourMatMenuModule,
  ],
})
export class SidebarComponent {
  readonly TourType = TourType;
  
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
      { icon: 'icon-dashboard.svg', label: 'Dashboard', route: '/dashboard', tourId: TourType.DASHBOARD},
      {
        icon: 'icon-queue.svg',
        label: 'Waiting Room',
        route: '/waiting-room',
        badge: this.pendingConsultations(),
        tourId: TourType.WAITING_ROOM_MENU
      },
      {
        icon: 'icon-open.svg',
        label: 'Opened Consultations',
        route: '/open-consultations',
        badge: this.activeConsultations(),
        tourId: TourType.OPENED_CONSULTATIONS_MENU
      },
      {
        icon: 'icon-history.svg',
        label: 'Consultation history',
        route: '/closed-consultations',
        tourId: TourType.CONSULTATION_HISTORY_MENU
      },
      { icon: 'icon-invite.svg', label: 'Invites', route: '/invites', tourId: TourType.INVITES_MENU },
      { icon: 'icon-calendar.svg', label: 'Availability', route: '/availability', tourId: TourType.AVAILABILITY },
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
        return this.guidedTourService.getPractitionerTour();
      case '/waiting-room':
        
      case '/profile':
        return this.guidedTourService.getProfileTour();
      case '/invites':
        
      case '/open-consultations':
      case '/consultation-detail':
        return this.guidedTourService.getConsultationHistoryTour();
      default:
        return null;
    }
  }

  startTour() {
    if (!this.isMobile) {
      this.isSidebarVisible = true;
    }
    
      
      const sidebarTour = this.guidedTourService.getPractitionerTour();
      this.guidedTourService.startTour(sidebarTour);
  }

  logout(){
    this.authService.logout()
  }
}

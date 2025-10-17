import { Component, HostListener, input, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
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
import { MatMenuModule } from '@angular/material/menu';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { User } from '../../../models/user.model';

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
    MatMenuModule
  ],
})
export class SidebarComponent {
  isLoggedIn = input<boolean>(true);
  pendingConsultations = input<number | undefined>(0);
  activeConsultations = input<number | undefined>(0);
  private authService = inject(AuthService)
  currentUser: User | null = null;
  showDropdown=false


  isMobile = false;
  isSidebarOpen = true;
  isSidebarVisible = true;
  sidebarItems: SidebarItem[] = [];

  ngOnInit() {
    this.checkMobileView();
    this.currentUser = this.authService.getCurrentUser()

    this.sidebarItems = [
      { icon: 'icon-dashboard.svg', label: 'Dashboard', route: '/dashboard' },
      {
        icon: 'icon-queue.svg',
        label: 'Waiting Room',
        route: '/waiting-room',
        badge: this.pendingConsultations(),
      },
      {
        icon: 'icon-open.svg',
        label: 'Opened Consultations',
        route: '/open-consultations',
        badge: this.activeConsultations(),
      },
      {
        icon: 'icon-history.svg',
        label: 'Consultation history',
        route: '/closed-consultations',
      },
      { icon: 'icon-invite.svg', label: 'My Invitations', route: '/invites' },
      { icon: 'icon-calendar.svg', label: 'Availability', route: '/availability' },
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


  logout() {
    this.authService.logout()
  }
}

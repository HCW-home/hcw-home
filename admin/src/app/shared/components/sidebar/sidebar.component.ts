import { Component, Input, HostListener } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatBadgeModule } from '@angular/material/badge';
import { CommonModule } from '@angular/common';
import { SidebarItem } from '../../../models/sidebar.model';
import { AngularSvgIconModule } from 'angular-svg-icon';

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
    AngularSvgIconModule,
  ]
})
export class SidebarComponent {
  @Input() isLoggedIn: boolean = true;

  isMobile = false;
  isSidebarOpen = true;
  isSidebarVisible = true;
  sidebarItems: SidebarItem[] = [];

  ngOnInit() {
    this.checkMobileView();

    this.sidebarItems = [
      { icon: "icon-dashboard.svg", label: "Dashboard", route: "/dashboard" },
      { icon: "icon-user.svg", label: "Users", route: "/user" },
      { icon: "icon-user.svg", label: "Resource Management", route: "/resources" },
      { icon: "icon-term.svg", label: 'Terms', route: '/term' },
      { icon: "icon-queue.svg", label: "Waiting Queues", route: "/queue" },
      { icon: "server.svg", label: "Mediasoup", route: "/mediasoup" },
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
}
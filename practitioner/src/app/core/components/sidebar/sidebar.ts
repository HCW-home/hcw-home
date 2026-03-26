import {
  Component,
  inject,
  OnDestroy,
  OnInit,
  Output,
  EventEmitter,
} from '@angular/core';
import { Svg } from '../../../shared/ui-components/svg/svg';
import { MenuItems } from '../../constants/sidebar';
import { Typography } from '../../../shared/ui-components/typography/typography';
import { TypographyTypeEnum } from '../../../shared/constants/typography';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { RoutePaths } from '../../constants/routes';
import { IUser } from '../../../modules/user/models/user';
import { Subscription } from 'rxjs';
import { UserService } from '../../services/user.service';
import { Auth } from '../../services/auth';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { TranslationService } from '../../services/translation.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-sidebar',
  imports: [
    Svg,
    Typography,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    CommonModule,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar implements OnInit, OnDestroy {
  public router = inject(Router);
  private userService = inject(UserService);
  private authService = inject(Auth);
  private titleService = inject(Title);
  private t = inject(TranslationService);
  private themeService = inject(ThemeService);

  menuItems = MenuItems;
  currentUserSubscription!: Subscription;
  currentUser: IUser | null = null;
  isCollapsed = false;
  siteLogo: string | null = null;
  branding = 'HCW';
  @Output() collapsedChange = new EventEmitter<boolean>();

  ngOnInit(): void {
    const savedState = localStorage.getItem('sidebar-collapsed');
    if (savedState !== null) {
      this.isCollapsed = JSON.parse(savedState);
      this.collapsedChange.emit(this.isCollapsed);
    }

    this.currentUserSubscription = this.userService.currentUser$.subscribe(
      user => {
        this.currentUser = user;
      }
    );

    this.authService.getOpenIDConfig().subscribe({
      next: config => {
        this.siteLogo = config.main_organization?.logo_color || null;
        if (config.branding) {
          this.branding = config.branding;
          this.titleService.setTitle(config.branding);
        }
        if (config.site_favicon) {
          this.updateFavicon(config.site_favicon);
        }
        if (config.languages?.length) {
          this.t.loadLanguages(config.languages);
        }
        if (config.primary_color_practitioner) {
          this.themeService.applyPrimaryColor(config.primary_color_practitioner);
        }
      },
    });
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    localStorage.setItem('sidebar-collapsed', JSON.stringify(this.isCollapsed));
    this.collapsedChange.emit(this.isCollapsed);
  }

  ngOnDestroy(): void {
    this.currentUserSubscription?.unsubscribe();
  }

  private updateFavicon(url: string): void {
    const link: HTMLLinkElement =
      document.querySelector("link[rel~='icon']") ||
      document.createElement('link');
    link.rel = 'icon';
    link.href = url;
    document.head.appendChild(link);
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly RoutePaths = RoutePaths;
}

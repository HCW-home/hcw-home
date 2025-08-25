import { Component, computed, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule, SvgIconRegistryService } from 'angular-svg-icon';
import { AuthService } from './auth/auth.service';
import { MatProgressSpinner, MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TourMatMenuModule } from 'ngx-ui-tour-md-menu';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    AngularSvgIconModule,
    MatProgressSpinnerModule,
    CommonModule,
    TourMatMenuModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'practitioner';
  pendingConsultations: number | undefined = 5;
  activeConsultations: number | undefined = 0;
  loginChecked = computed(() => this.authService.loginChecked());
  isLoggedIn = computed(() => this.authService.isLoggedIn());
  private iconNames = ['warning', 'download', 'chevron_right','x', 'chevron_left', 'close'];

  constructor(
    private iconRegistry: SvgIconRegistryService,
    private authService:AuthService

  ) {}

  ngOnInit(): void {
    this.registerAllIcons();
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
    setTimeout(() => {
      this.convertMatIcons();
      this.observeForNewIcons();
    }, 100);
  }

  private convertMatIcons(): void {
    const matIcons = document.querySelectorAll('mat-icon');
    matIcons.forEach((icon: Element) => {
      const iconText = icon.textContent?.trim();
      if (iconText && this.iconNames.includes(iconText)) {
        icon.setAttribute('data-icon', iconText);
      }
    });
  }

  private observeForNewIcons(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName?.toLowerCase() === 'mat-icon') {
              this.processIcon(element);
            }
            const matIcons = element.querySelectorAll?.('mat-icon');
            matIcons?.forEach((icon) => this.processIcon(icon));
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private processIcon(icon: Element): void {
    const iconText = icon.textContent?.trim();
    if (iconText && this.iconNames.includes(iconText)) {
      icon.setAttribute('data-icon', iconText);
    }
  }
}


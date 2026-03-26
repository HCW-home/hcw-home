import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth } from '../../../core/services/auth';
import { ThemeService } from '../../../core/services/theme.service';
import { TranslationService } from '../../../core/services/translation.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-auth-branding',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-branding.html',
  styleUrl: './auth-branding.scss',
})
export class AuthBranding implements OnDestroy {
  private authService = inject(Auth);
  private themeService = inject(ThemeService);
  private translationService = inject(TranslationService);
  private destroy$ = new Subject<void>();

  siteLogoWhite: string | null = null;
  loginText: string | null = null;
  configError = false;

  constructor() {
    effect(() => {
      this.translationService.currentLanguage();
      this.loadConfig();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadConfig(): void {
    this.authService.getOpenIDConfig().pipe(takeUntil(this.destroy$)).subscribe({
      next: config => {
        if (!config) {
          this.configError = true;
          return;
        }
        this.configError = false;
        this.siteLogoWhite = config.main_organization?.logo_white || null;
        this.loginText = config.main_organization?.login_text_practitioner || null;
        if (config.primary_color_practitioner) {
          this.themeService.applyPrimaryColor(config.primary_color_practitioner);
        }
      },
    });
  }
}

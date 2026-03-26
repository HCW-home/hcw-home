import { Component, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { TranslationService } from '../../../core/services/translation.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-auth-branding',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-branding.component.html',
  styleUrl: './auth-branding.component.scss',
})
export class AuthBrandingComponent implements OnDestroy {
  private authService = inject(AuthService);
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
    this.authService.getConfig().pipe(takeUntil(this.destroy$)).subscribe({
      next: (config: any) => {
        if (!config) {
          this.configError = true;
          return;
        }
        this.configError = false;
        this.siteLogoWhite = config.main_organization?.logo_white || null;
        this.loginText = config.main_organization?.login_text_patient || null;
      },
    });
  }
}

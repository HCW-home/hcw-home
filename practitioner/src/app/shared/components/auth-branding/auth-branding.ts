import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Auth } from '../../../core/services/auth';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-auth-branding',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-branding.html',
  styleUrl: './auth-branding.scss',
})
export class AuthBranding implements OnInit {
  private authService = inject(Auth);
  private themeService = inject(ThemeService);

  siteLogoWhite: string | null = null;
  branding = '';
  loginText: string | null = null;

  ngOnInit(): void {
    this.authService.getOpenIDConfig().subscribe({
      next: config => {
        this.siteLogoWhite = config.main_organization?.logo_white || null;
        this.loginText = config.main_organization?.login_text_practitioner || null;
        if (config.branding) {
          this.branding = config.branding;
        }
        if (config.primary_color_practitioner) {
          this.themeService.applyPrimaryColor(config.primary_color_practitioner);
        }
      },
    });
  }
}

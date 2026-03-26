import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth-branding',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './auth-branding.component.html',
  styleUrl: './auth-branding.component.scss',
})
export class AuthBrandingComponent implements OnInit {
  private authService = inject(AuthService);

  siteLogoWhite: string | null = null;
  branding = '';

  ngOnInit(): void {
    this.authService.getConfig().subscribe({
      next: (config: any) => {
        this.siteLogoWhite = config.main_organization?.logo_white || null;
        if (config.branding) {
          this.branding = config.branding;
        }
      },
    });
  }
}

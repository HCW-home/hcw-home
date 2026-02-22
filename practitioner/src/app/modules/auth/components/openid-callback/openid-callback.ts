import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Auth } from '../../../../core/services/auth';
import { RoutePaths } from '../../../../core/constants/routes';
import { TranslationService } from '../../../../core/services/translation.service';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { Loader } from '../../../../shared/components/loader/loader';

@Component({
  selector: 'app-openid-callback',
  imports: [Typography, Loader, TranslatePipe],
  templateUrl: './openid-callback.html',
  styleUrl: './openid-callback.scss',
})
export class OpenIdCallback implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(Auth);
  private t = inject(TranslationService);

  errorMessage = '';
  isLoading = true;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      const state = params['state'];
      const error = params['error'];
      const errorDescription = params['error_description'];

      if (error) {
        this.handleError(errorDescription || error);
        return;
      }

      const savedState = sessionStorage.getItem('openid_state');
      sessionStorage.removeItem('openid_state');

      if (!state || state !== savedState) {
        this.handleError(this.t.instant('openIdCallback.invalidState'));
        return;
      }

      if (code) {
        this.authService.loginWithOpenID(code).subscribe({
          next: response => {
            this.authService.setToken(response.access);
            this.authService.setRefreshToken(response.refresh);
            this.router.navigate([`/${RoutePaths.USER}`, RoutePaths.DASHBOARD]);
          },
          error: err => {
            const message =
              err.error?.non_field_errors?.[0] ||
              err.error?.detail ||
              this.t.instant('openIdCallback.authFailed');
            this.handleError(message);
          },
        });
      } else {
        this.handleError(this.t.instant('openIdCallback.noCode'));
      }
    });
  }

  private handleError(message: string): void {
    this.isLoading = false;
    this.errorMessage = message;
    setTimeout(() => {
      this.router.navigate([`/${RoutePaths.AUTH}`]);
    }, 3000);
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
}

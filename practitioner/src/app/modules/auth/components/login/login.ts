import { Component, inject, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { Input } from '../../../../shared/ui-components/input/input';
import { Button } from '../../../../shared/ui-components/button/button';
import {
  ButtonStyleEnum,
  ButtonTypeEnum,
} from '../../../../shared/constants/button';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { RoutePaths } from '../../../../core/constants/routes';
import { ActionHandlerService } from '../../../../core/services/action-handler.service';
import { ConsultationService } from '../../../../core/services/consultation.service';
import { TranslationService } from '../../../../core/services/translation.service';
import {
  FormGroup,
  Validators,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { ValidationService } from '../../../../core/services/validation.service';
import { Auth } from '../../../../core/services/auth';
import { ErrorMessage } from '../../../../shared/components/error-message/error-message';
import { LanguageSelector } from '../../../../shared/components/language-selector/language-selector';
import { AuthBranding } from '../../../../shared/components/auth-branding/auth-branding';
import { UserService } from '../../../../core/services/user.service';
import { ThemeService } from '../../../../core/services/theme.service';

interface LoginForm {
  email: FormControl<string>;
  password: FormControl<string>;
}

@Component({
  selector: 'app-login',
  imports: [
    Input,
    Button,
    Typography,
    RouterLink,
    ErrorMessage,
    TranslatePipe,
    ReactiveFormsModule,
    LanguageSelector,
    AuthBranding,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  errorMessage = '';
  loadingButton = false;
  openIdEnabled = false;
  openIdProviderName = '';
  disablePasswordLogin = false;
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private titleService = inject(Title);
  private formBuilder = inject(FormBuilder);
  private adminAuthService = inject(Auth);
  private actionHandler = inject(ActionHandlerService);
  private consultationService = inject(ConsultationService);
  public validationService = inject(ValidationService);
  private t = inject(TranslationService);
  private userService = inject(UserService);
  private themeService = inject(ThemeService);
  form: FormGroup<LoginForm> = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.errorMessage = '';
    });
  }

  ngOnInit() {
    // Clean up JWT tokens to prevent websocket reconnection attempts
    this.adminAuthService.removeToken();

    this.adminAuthService.getOpenIDConfig().subscribe({
      next: config => {
        this.openIdEnabled = config.enabled;
        this.openIdProviderName = config.provider_name || 'OpenID';
        this.disablePasswordLogin = config.disable_password_login || false;
        if (config.branding) {
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

        // If password login is disabled and OpenID is enabled, redirect to SSO
        if (this.disablePasswordLogin && this.openIdEnabled) {
          this.onOpenIDLogin();
        }
      },
      error: err => {
        console.error('Failed to get OpenID config:', err);
        this.openIdEnabled = false;
      },
    });

    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.form.patchValue({ email });
    }
  }

  onSubmit() {
    if (this.form.valid) {
      this.loadingButton = true;
      const value = this.form.getRawValue();
      const body = {
        email: value.email,
        password: value.password,
      };
      this.adminAuthService.login(body).subscribe({
        next: res => {
          this.adminAuthService.setToken(res.access);
          if (res.refresh) {
            this.adminAuthService.setRefreshToken(res.refresh);
          }
          this.loadingButton = false;

          this.userService.getCurrentUser().subscribe({
            next: () => {
              this.navigateAfterLogin();
            },
            error: () => {
              this.navigateAfterLogin();
            },
          });
        },
        error: () => {
          this.loadingButton = false;
          this.errorMessage = this.t.instant('login.authenticationFailed');
        },
      });
    } else {
      this.validationService.validateAllFormFields(this.form);
    }
  }

  getErrorMessage(field: string): string {
    switch (field) {
      case 'email':
        if (this.form.get('email')?.errors?.['required']) {
          return this.t.instant('login.fieldRequired');
        } else {
          return this.t.instant('login.invalidEmail');
        }
      default:
        return this.t.instant('login.fieldRequired');
    }
  }

  private navigateAfterLogin(): void {
    const action = this.route.snapshot.queryParamMap.get('action');
    const id = this.route.snapshot.queryParamMap.get('id');

    if (action === 'join' && id) {
      this.consultationService.getParticipantById(id).subscribe({
        next: participant => {
          const consultation = participant.appointment.consultation;
          const consultationId =
            typeof consultation === 'object'
              ? (consultation as { id: number }).id
              : consultation;
          this.router.navigate(
            ['/', RoutePaths.USER, RoutePaths.CONSULTATIONS, consultationId],
            {
              queryParams: {
                join: 'true',
                appointmentId: participant.appointment.id,
              },
            }
          );
        },
        error: () => {
          this.router.navigate(['/', RoutePaths.CONFIRM_PRESENCE, id]);
        },
      });
    } else if (action) {
      const route = this.actionHandler.getRouteForAction(action, id);
      this.router.navigateByUrl(route);
    } else {
      this.router.navigate([`/${RoutePaths.USER}`, RoutePaths.DASHBOARD]);
    }
  }

  onOpenIDLogin() {
    this.adminAuthService.initiateOpenIDLogin();
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
  protected readonly ButtonTypeEnum = ButtonTypeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly RoutePaths = RoutePaths;
}

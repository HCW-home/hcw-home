import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { Auth } from '../../core/services/auth';
import { ActionHandlerService } from '../../core/services/action-handler.service';
import { ToasterService } from '../../core/services/toaster.service';
import { TranslationService } from '../../core/services/translation.service';
import { Typography } from '../../shared/ui-components/typography/typography';
import { Button } from '../../shared/ui-components/button/button';
import { Input } from '../../shared/ui-components/input/input';
import { Svg } from '../../shared/ui-components/svg/svg';
import { Loader } from '../../shared/components/loader/loader';
import { ErrorMessage } from '../../shared/components/error-message/error-message';
import { TypographyTypeEnum } from '../../shared/constants/typography';
import { ButtonTypeEnum, ButtonStyleEnum } from '../../shared/constants/button';

@Component({
  selector: 'app-verify-invite',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    Typography,
    Button,
    Input,
    Svg,
    Loader,
    ErrorMessage,
  ],
  templateUrl: './verify-invite.html',
  styleUrl: './verify-invite.scss',
})
export class VerifyInvite implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  authToken: string | null = null;
  action: string | null = null;
  actionId: string | null = null;
  isLoading = true;
  requiresVerification = false;
  errorMessage: string | null = null;
  isResending = false;
  loadingButton = false;

  verificationForm: FormGroup;

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonTypeEnum = ButtonTypeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: Auth,
    private actionHandler: ActionHandlerService,
    private toasterService: ToasterService,
    private t: TranslationService
  ) {
    this.verificationForm = this.fb.group({
      verification_code: [
        '',
        [Validators.required, Validators.minLength(6), Validators.maxLength(6)],
      ],
    });
  }

  ngOnInit(): void {
    this.authToken = this.route.snapshot.queryParamMap.get('auth');
    this.action = this.route.snapshot.queryParamMap.get('action');
    this.actionId = this.route.snapshot.queryParamMap.get('id');

    if (this.authToken) {
      this.authenticateWithToken();
    } else {
      this.isLoading = false;
      this.errorMessage = this.t.instant('verifyInvite.noToken');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private authenticateWithToken(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.authService
      .loginWithToken({ auth_token: this.authToken! })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.isLoading = false;
          if (response.access && response.refresh) {
            this.authService.setToken(response.access);
            this.authService.setRefreshToken(response.refresh);
            this.onAuthenticationSuccess();
          } else if (response.requires_verification) {
            this.requiresVerification = true;
          } else if (response.error) {
            this.errorMessage = response.error;
          }
        },
        error: error => {
          this.isLoading = false;
          if (error.status === 202) {
            this.requiresVerification = true;
          } else if (error.status === 401) {
            this.errorMessage =
              error.error?.error ||
              this.t.instant('verifyInvite.invalidOrExpired');
          } else {
            this.errorMessage = this.t.instant('verifyInvite.genericError');
          }
        },
      });
  }

  submitVerificationCode(): void {
    if (this.verificationForm.invalid || !this.authToken) {
      return;
    }

    this.loadingButton = true;
    this.errorMessage = null;

    const verificationCode =
      this.verificationForm.get('verification_code')?.value;

    this.authService
      .loginWithToken({
        auth_token: this.authToken,
        verification_code: verificationCode,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.loadingButton = false;
          if (response.access && response.refresh) {
            this.authService.setToken(response.access);
            this.authService.setRefreshToken(response.refresh);
            this.onAuthenticationSuccess();
          } else if (response.error) {
            this.errorMessage = response.error;
          }
        },
        error: error => {
          this.loadingButton = false;
          if (error.status === 401) {
            this.errorMessage =
              error.error?.error ||
              this.t.instant('verifyInvite.invalidVerificationCode');
          } else {
            this.errorMessage = this.t.instant('verifyInvite.genericError');
          }
        },
      });
  }

  private onAuthenticationSuccess(): void {
    this.toasterService.show(
      'success',
      this.t.instant('verifyInvite.authTitle'),
      this.t.instant('verifyInvite.authSuccess')
    );
    const route = this.actionHandler.getRouteForAction(
      this.action,
      this.actionId
    );
    this.router.navigateByUrl(route);
  }

  resendVerificationCode(): void {
    if (!this.authToken || this.isResending) {
      return;
    }

    this.isResending = true;
    this.errorMessage = null;

    this.authService
      .loginWithToken({ auth_token: this.authToken })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.isResending = false;
          if (response.access && response.refresh) {
            this.authService.setToken(response.access);
            this.authService.setRefreshToken(response.refresh);
            this.onAuthenticationSuccess();
          } else {
            this.toasterService.show(
              'success',
              this.t.instant('verifyInvite.codeSentTitle'),
              this.t.instant('verifyInvite.codeSentSuccess')
            );
          }
        },
        error: error => {
          this.isResending = false;
          if (error.status === 202) {
            this.toasterService.show(
              'success',
              this.t.instant('verifyInvite.codeSentTitle'),
              this.t.instant('verifyInvite.codeSentSuccess')
            );
          } else {
            this.toasterService.show(
              'error',
              this.t.instant('verifyInvite.resendFailedTitle'),
              this.t.instant('verifyInvite.resendFailedMessage')
            );
          }
        },
      });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/auth');
  }
}

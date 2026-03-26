import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormGroup,
  Validators,
  FormControl,
  FormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

import { Button } from '../../../../shared/ui-components/button/button';
import { Input } from '../../../../shared/ui-components/input/input';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import {
  ButtonTypeEnum,
  ButtonStyleEnum,
} from '../../../../shared/constants/button';

import { Auth } from '../../../../core/services/auth';
import { ValidationService } from '../../../../core/services/validation.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { regexpPasswordSpec } from '../../../../shared/tools/regular-expressions';
import { ErrorMessage } from '../../../../shared/components/error-message/error-message';
import { ToasterService } from '../../../../core/services/toaster.service';
import { LanguageSelector } from '../../../../shared/components/language-selector/language-selector';
import { AuthBranding } from '../../../../shared/components/auth-branding/auth-branding';
import { RoutePaths } from '../../../../core/constants/routes';

interface SetPasswordForm {
  password: FormControl<string>;
  confirmPassword: FormControl<string>;
}

@Component({
  selector: 'app-reset-password',
  imports: [Button, Input, Typography, ReactiveFormsModule, ErrorMessage, TranslatePipe, LanguageSelector, RouterLink, AuthBranding],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  loadingButton = false;
  errorMessage = '';
  public mode: 'set' | 'reset' = 'reset';
  private formBuilder = inject(FormBuilder);
  private adminAuthService = inject(Auth);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toaster = inject(ToasterService);
  public validationService = inject(ValidationService);
  private t = inject(TranslationService);
  token = this.route.snapshot.params['token'];
  uid = this.route.snapshot.params['uid'];

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonTypeEnum = ButtonTypeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly RoutePaths = RoutePaths;

  form: FormGroup<SetPasswordForm> = this.formBuilder.nonNullable.group({
    password: ['', [Validators.required]],
    confirmPassword: ['', [Validators.required]],
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.errorMessage = '';
    });
  }

  ngOnInit() {
    const path = this.route.snapshot.routeConfig?.path;
    if (path?.startsWith('set-password')) {
      this.mode = 'set';
    } else {
      this.mode = 'reset';
    }

    this.adminAuthService.getOpenIDConfig().subscribe({
      next: config => {
        if (config.languages?.length) {
          this.t.loadLanguages(config.languages);
        }
      },
    });
  }

  onSubmit() {
    this.errorMessage = this.getErrorMessage();
    if (!this.errorMessage) {
      const formData = this.form.getRawValue();
      if (this.form.valid) {
        this.loadingButton = true;
        const params = {
          uid: this.uid,
          token: this.token,
          new_password1: formData.password,
          new_password2: formData.confirmPassword,
        };
        this.adminAuthService.setPassword(params).subscribe({
          next: () => {
            this.loadingButton = true;
            this.toaster.show(
              'success',
              this.t.instant('resetPassword.successTitle'),
              this.t.instant('resetPassword.successMessage')
            );
            this.router.navigate([`/${RoutePaths.AUTH}`]);
          },
          error: err => {
            this.errorMessage = '';
            this.loadingButton = false;
            this.toaster.show('error', this.t.instant('resetPassword.errorTitle'), err.message);
          },
        });
      } else {
        this.validationService.validateAllFormFields(this.form);
      }
    }
  }

  getErrorMessage(): string {
    const data = this.form.value;
    if (data.password !== data.confirmPassword) {
      return this.t.instant('resetPassword.passwordsMismatch');
    }
    if (
      !regexpPasswordSpec.test(data.password || '') ||
      !regexpPasswordSpec.test(data.confirmPassword || '')
    ) {
      return this.t.instant('resetPassword.passwordRequirements');
    }
    return '';
  }

  getFormErrorMessage(): string {
    return this.t.instant('resetPassword.fieldRequired');
  }
}

import { Component, inject, OnInit } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Input } from '../../../../shared/ui-components/input/input';
import { Button } from '../../../../shared/ui-components/button/button';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import {
  ButtonTypeEnum,
  ButtonStyleEnum,
} from '../../../../shared/constants/button';
import { Router, RouterLink } from '@angular/router';
import { RoutePaths } from '../../../../core/constants/routes';
import {
  FormGroup,
  Validators,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { Auth } from '../../../../core/services/auth';
import { ToasterService } from '../../../../core/services/toaster.service';
import { ValidationService } from '../../../../core/services/validation.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { LanguageSelector } from '../../../../shared/components/language-selector/language-selector';
import { AuthBranding } from '../../../../shared/components/auth-branding/auth-branding';

interface ForgotPasswordForm {
  email: FormControl<string>;
}

@Component({
  selector: 'app-forgot-password',
  imports: [Button, Input, Typography, RouterLink, ReactiveFormsModule, TranslatePipe, LanguageSelector, AuthBranding],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  loadingButton = false;
  private router = inject(Router);
  private formBuilder = inject(FormBuilder);
  private toaster = inject(ToasterService);
  private adminAuthService = inject(Auth);
  public validationService = inject(ValidationService);
  private t = inject(TranslationService);
  form: FormGroup<ForgotPasswordForm> = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  onSubmit() {
    if (this.form.valid) {
      this.loadingButton = true;
      const value = this.form.getRawValue();
      const body = {
        email: value.email,
      };
      this.adminAuthService.forgotPassword(body).subscribe({
        next: () => {
          this.loadingButton = false;
          this.toaster.show(
            'success',
            this.t.instant('forgotPassword.checkEmailTitle'),
            this.t.instant('forgotPassword.checkEmailMessage')
          );
          this.router.navigate([`/${RoutePaths.AUTH}`]);
        },
        error: err => {
          this.loadingButton = false;
          this.toaster.show('error', this.t.instant('forgotPassword.errorTitle'), err.message);
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
          return this.t.instant('forgotPassword.fieldRequired');
        } else {
          return this.t.instant('forgotPassword.invalidEmail');
        }
      default:
        return '';
    }
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonTypeEnum = ButtonTypeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly RoutePaths = RoutePaths;
}

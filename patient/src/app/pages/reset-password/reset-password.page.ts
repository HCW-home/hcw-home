import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonIcon,
  IonText,
  IonSpinner,
  NavController,
  ToastController
} from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { TranslationService } from '../../core/services/translation.service';
import { AuthBrandingComponent } from '../../shared/components/auth-branding/auth-branding.component';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonContent,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonText,
    IonSpinner,
    TranslatePipe, AuthBrandingComponent]
})
export class ResetPasswordPage implements OnInit, OnDestroy {
  private t = inject(TranslationService);
  private destroy$ = new Subject<void>();

  uid: string | null = null;
  token: string | null = null;
  resetPasswordForm: FormGroup;
  isLoading = false;
  showPassword = false;
  showConfirmPassword = false;
  errorMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private authService: AuthService,
    private navCtrl: NavController,
    private toastCtrl: ToastController
  ) {
    this.resetPasswordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  ngOnInit(): void {
    this.uid = this.route.snapshot.queryParamMap.get('uid');
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.uid || !this.token) {
      this.errorMessage = this.t.instant('resetPassword.invalidLink');
    }

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  async onSubmit(): Promise<void> {
    if (!this.uid || !this.token) {
      return;
    }

    const { password, confirmPassword } = this.resetPasswordForm.value;

    if (password !== confirmPassword) {
      this.errorMessage = this.t.instant('resetPassword.passwordsMismatch');
      return;
    }

    if (this.resetPasswordForm.valid) {
      this.isLoading = true;
      this.errorMessage = null;

      this.authService.resetPasswordConfirm({
        uid: this.uid,
        token: this.token,
        new_password1: password,
        new_password2: confirmPassword
      })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async () => {
            this.isLoading = false;
            const toast = await this.toastCtrl.create({
              message: this.t.instant('resetPassword.resetSuccess'),
              duration: 3000,
              position: 'top',
              color: 'success'
            });
            await toast.present();
            this.navCtrl.navigateRoot('/login');
          },
          error: async (error) => {
            this.isLoading = false;
            let message = this.t.instant('resetPassword.resetFailed');
            if (error.error?.new_password1) {
              message = error.error.new_password1[0];
            } else if (error.error?.new_password2) {
              message = error.error.new_password2[0];
            } else if (error.error?.token) {
              message = this.t.instant('resetPassword.linkExpired');
            } else if (error.error?.uid) {
              message = this.t.instant('resetPassword.invalidResetLink');
            }
            const toast = await this.toastCtrl.create({
              message,
              duration: 3000,
              position: 'top',
              color: 'danger'
            });
            await toast.present();
          }
        });
    }
  }

  goToLogin(): void {
    this.navCtrl.navigateRoot('/login');
  }

  goToForgotPassword(): void {
    this.navCtrl.navigateRoot('/forgot-password');
  }
}

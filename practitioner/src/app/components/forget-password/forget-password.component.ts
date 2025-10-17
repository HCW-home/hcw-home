import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule, MatError } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule, Router } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../services/toast/toast.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ButtonComponent } from '../ui/button/button.component';

@Component({
  selector: 'app-forget-password',
  standalone: true,
  templateUrl: './forget-password.component.html',
  styleUrl: './forget-password.component.scss',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatError,
    MatIconModule,
    RouterModule,
    AngularSvgIconModule,
    MatProgressSpinnerModule,
    ButtonComponent
  ],
})
export class ForgotPasswordComponent {
  step = 1;
  readonly DEFAULT_OTP = '123456';
  error = '';
  loading = signal(false)

  forgotForm: FormGroup;
  otpForm: FormGroup;
  resetForm: FormGroup;

  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router
  ) {
    this.forgotForm = this.fb.group({
      username: ['', [Validators.required, Validators.email]],
    });

    this.otpForm = this.fb.group({
      otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });

    this.resetForm = this.fb.group({
      password: ['', [Validators.required]],
      confirmPassword: ['', [Validators.required]],
    });
  }

  get passwordMismatch(): boolean {
    const { password, confirmPassword } = this.resetForm.value;
    return !!password && !!confirmPassword && password !== confirmPassword;
  }

  sendOtp() {
    if (this.forgotForm.valid) {
      const username = this.forgotForm.value.username;
      this.toastService.showSuccess('OTP sent successfully');
      this.step = 2;
    }
  }

  verifyOtp() {
    if (this.otpForm.valid && this.otpForm.value.otp === this.DEFAULT_OTP) {
      this.toastService.showSuccess('OTP verified successfully');
      this.step = 3;
    } else {
      this.otpForm.get('otp')?.setErrors({ incorrect: true });
      this.error = 'OTP not matched';
      this.toastService.showError(this.error);
    }
  }

  resetPassword() {
    if (this.resetForm.valid && !this.passwordMismatch) {
      this.loading.set(true);

      const password = this.resetForm.get('password')?.value;
      const username = this.forgotForm.get('username')?.value;

      this.authService.updatePassword(password, username).subscribe({
        next: (res) => {
          this.toastService.showSuccess(res.message || 'Password reset successful');
          this.loading.set(false);
          this.router.navigate(['/login']);
        },
        error: (err) => {
          this.error = err?.error.message;
          this.loading.set(false);
          this.toastService.showError('Failed to reset password');
        },
      });
    }
  }
}

import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule, MatError } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../services/toast/toast.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ButtonComponent } from '../ui/button/button.component';
@Component({
  selector: 'app-set-password',
  templateUrl: './set-password.component.html',
  styleUrl: './set-password.component.scss',
  standalone: true,
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
export class SetPasswordComponent {
  private route = inject(ActivatedRoute);
  error = '';
  loading = signal(false)
  resetForm: FormGroup;

  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router
  ) {


    this.resetForm = this.fb.group({
      password: ['', [Validators.required]],
      confirmPassword: ['', [Validators.required]],
    });
  }

  get passwordMismatch(): boolean {
    const { password, confirmPassword } = this.resetForm.value;
    return !!password && !!confirmPassword && password !== confirmPassword;
  }
  resetPassword() {
    if (this.resetForm.valid && !this.passwordMismatch) {
      this.loading.set(true);
      const queryParams = this.route.snapshot.queryParams;
      const username = queryParams['email'];
      const accessToken = queryParams['aT'];
      const refreshToken = queryParams['rT'];
      const password = this.resetForm.get('password')?.value;
      this.authService.updatePassword(password, username).subscribe({
        next: (res) => {
          this.toastService.showSuccess(res.message || 'Password set successful');
          this.loading.set(false);
          const loginUrl = `/login?aT=${accessToken}&rT=${refreshToken}`;
          this.router.navigateByUrl(loginUrl).then(() => {
            window.location.reload();
          });
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

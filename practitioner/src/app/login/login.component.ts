import { Component, OnInit, inject, signal } from '@angular/core';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
  FormsModule,
  NgForm,
  FormGroupDirective,
  FormGroup,
} from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../environments/environment';
import { SnackbarService } from '../services/snackbar/snackbar.service';
import { AccessDeniedComponent } from '../components/access-denied/access-denied.component';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { ButtonComponent } from '../components/ui/button/button.component';
import { TermService } from '../services/term.service';
import { SetPasswordComponent } from '../components/set-password/set-password.component';



export class MyErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: NgForm | FormGroupDirective | null): boolean {
    const isSubmitted = form?.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}


@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    AccessDeniedComponent,
    AngularSvgIconModule,
    ButtonComponent,
    RouterModule,
    SetPasswordComponent


  ],
})

export class LoginComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private snackBarService=inject(SnackbarService)
  private termService= inject(TermService)
  errorMessage:string = '';
  showSetPasswordForm:boolean=false;
  showPassword = false;

  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required])
  });
  get email() {
    return this.loginForm.get('email') as FormControl;
  }
  get password() {
    return this.loginForm.get('password') as FormControl;
  }
  error: string | null = null;
  matcher = new MyErrorStateMatcher();
  loading = signal(false)
  returnUrl: string = '';
  showPasswordLogin = signal(true);
  showOpenIdLogin = signal(true);
  openIdLoginUrl: string = `${environment.apiUrl}/v1/auth/openid/login?role=practitioner`

  ngOnInit() {
    const queryParams = this.route.snapshot.queryParams;

    const accessToken = queryParams['aT'];
    const refreshToken = queryParams['rT'];
    this.returnUrl = queryParams['returnUrl'] || '/dashboard';
    const error = queryParams['error'];  
    const mode= queryParams['mode'];
    if(mode==='set-password'){
      this.showSetPasswordForm=true
    }
    else if (accessToken && refreshToken) {
      this.authService.login(accessToken,refreshToken).subscribe({

        next: (user) => {
          if (user) {
            this.snackBarService.showSuccess('Logged In Successfull')
            this.termService.getLatestTermAndStore()
            this.router.navigateByUrl(this.returnUrl).then(() => {
              this.termService.getLatestTermAndStore().subscribe();
            });
          }
        },
        error: (err) => {
          console.error('[Login] Error fetching profile:', err);
        }
      });
      return;
    } else if (error) {
      this.errorMessage = error
    }

    if (this.authService.getCurrentUser()) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
  }


  loginLocal() {
    if (this.loginForm.valid) {
      this.loading.set(true);
      this.error = null;
      const { email, password } = this.loginForm.value!;
      this.authService.loginLocal(email!, password!).subscribe({
        next: (res) => {
          this.loading.set(false);
          this.snackBarService.showSuccess('Login Successful')

          setTimeout(() => {
            this.router.navigateByUrl(this.returnUrl);
          }, 100);
        },
        error: (err) => {
          this.loading.set(false);

          if (err?.error?.message) {
            const message = err.error.message.toLowerCase();

            if (message.includes('pending approval') || message.includes('not approved')) {
              this.error = `Account Pending Approval: ${err.error.message}`;
              this.snackBarService.showError('Your account is pending approval by an administrator. Please contact support for assistance.');
            } else if (message.includes('access denied') || message.includes('rejected')) {
              this.error = `Account Access Denied: ${err.error.message}`;
              this.snackBarService.showError('Your account access has been denied. Please contact support for more information.');
            } else {
              this.error = err.error.message;
              this.snackBarService.showError(err.error.message);
            }
          } else {
            this.error = 'Invalid email or password.';
            this.snackBarService.showError('Invalid email or password.');
          }

          console.error('Login failed:', err);
        }
      });
    } else {
      console.warn('Form invalid');
      this.snackBarService.showError('Please fill in all required fields correctly.');
    }
  }

  loginWithOpenID() {
    window.location.href = this.openIdLoginUrl;
    this.loading.set(true)
  }

}

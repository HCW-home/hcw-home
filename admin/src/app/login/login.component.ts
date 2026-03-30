import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
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
import { LoginUser } from '../models/user.model';
import { SnackbarService } from '../services/snackbar.service';
import { AccessDeniedComponent } from '../shared/components/access-denied/access-denied.component';
import { AngularSvgIconModule } from 'angular-svg-icon';



export class MyErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: NgForm | FormGroupDirective | null): boolean {
    const isSubmitted = form?.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}
// this.snackBarService.showError(`Failed to load users: ${error.message || 'Unknown error'}`);


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
    RouterModule
  ],
})

export class LoginComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private snackBarService=inject(SnackbarService)
  errorMessage=''
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
  loading =  signal(false)
  returnUrl: string = '';
  showPasswordLogin = signal(true);
  showOpenIdLogin = signal(true);
  openIdLoginUrl:string=`${environment.apiUrl}/auth/openid/login?role=admin`

  ngOnInit() {
    const queryParams = this.route.snapshot.queryParams;
    const accessToken = queryParams['aT'];
    const refreshToken = queryParams['rT'];
    this.returnUrl = queryParams['returnUrl'] || '/dashboard';
    const error = queryParams['error'];
    if (accessToken && refreshToken) {
      this.authService.login(accessToken,refreshToken).subscribe({
        next: (user) => {
          if (user) {
            this.snackBarService.showSuccess('Logged In Successfull')
            this.router.navigateByUrl(this.returnUrl);
          }
        },
        error: (err) => {
          console.error('[Login] Error fetching profile:', err);
        }
      });
      return;
    } else if (error){
      this.errorMessage=error      
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
          this.snackBarService.showSuccess('Login Successfull')
  
          setTimeout(() => {
            this.router.navigateByUrl(this.returnUrl);
          }, 100);
        },
        error: (err) => {
          this.loading.set(false);
          this.error = err?.error?.message || 'Invalid email or password.';
          console.error('Login failed:', err);
        }
      });
    } else {
      console.warn('Form invalid');
    }
  }

  loginWithOpenID() {
    window.location.href = this.openIdLoginUrl;
    this.loading.set(true)
  }

}

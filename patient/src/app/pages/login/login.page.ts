import { Component, OnDestroy, OnInit, computed, inject, effect, EffectRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormGroup,
  FormControl,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';
import {
  IonContent,
  IonIcon,
  IonButton,
  IonRow,
  IonGrid,
  IonLabel,
  IonCol,
  IonItem,
  IonInput,
  IonText,
  IonSpinner
} from '@ionic/angular/standalone';
import { ToastController } from '@ionic/angular';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { AuthService } from 'src/app/services/auth.service';
import { lastValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RoutePaths } from 'src/app/constants/route-path.enum';
import { logInOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';


function atLeastOneRequired(controlNames: string[]) {
  return (group: AbstractControl): ValidationErrors | null => {
    const anyPresent = controlNames.some(name => {
      const c = (group as FormGroup).get(name);
      return c && c.value != null && String(c.value).trim().length > 0;
    });
    return anyPresent ? null : { atLeastOneRequired: true };
  };
}

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    IonSpinner,
    IonText,
    IonInput,
    IonItem,
    IonCol,
    IonRow,
    IonGrid,
    IonLabel,
    IonIcon,
    IonButton,
    HeaderComponent,
    IonContent,
    CommonModule,
    ReactiveFormsModule
  ]
})
export class LoginPage implements OnInit, OnDestroy {
    constructor() {
      addIcons({
        logInOutline
      });
    }
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastController = inject(ToastController);
  private authService = inject(AuthService);
  private authEffect?: EffectRef;

  isLoggedIn = computed(() => this.authService.isLoggedIn());

  private destroy$ = new Subject<void>();

  isLoading = false;
  successMessage?: string;
  errorMessage?: string;
  returnUrl = '';

  loginForm: FormGroup = new FormGroup({
    email: new FormControl<string | null>(null, [Validators.email]),
    phoneNumber: new FormControl<string | null>(null, [Validators.pattern(/^\d{10}$/)])
  }, { validators: [atLeastOneRequired(['email', 'phoneNumber'])] });

  ngOnInit() {
    if (this.isLoggedIn()) {
      if (!this.router.url.startsWith(`/${RoutePaths.PatientDashboard}`)) {
        void this.router.navigateByUrl(`/${RoutePaths.PatientDashboard}`, { replaceUrl: true });
      }
      return;
    }
    const queryParams = this.route.snapshot.queryParams;
    const token = queryParams['token'];
    this.returnUrl = (queryParams['returnUrl'] as string) || `/${RoutePaths.PatientDashboard}`;
    const error = queryParams['error'];

    // Auto-login via token in query
    if (token) {
      this.isLoading = true;
      (async () => {
        try {
          await lastValueFrom(this.authService.loginMagic(String(token)));
          if (this.authService.getCurrentUser()?.temporaryAccount) {
            await this.router.navigate(['/profile']);
          }
          await this.router.navigateByUrl(String(this.returnUrl || '/home'));
        } catch (e: unknown) {
          const err = e as any;
          this.errorMessage = err?.error?.message ?? err?.message ?? 'Invalid token.';
          console.error('Login failed:', err);
        } finally {
          this.isLoading = false;
        }
      })();
    } else if (error) {
      this.errorMessage = String(error);
    }

    // UX: disable the counterpart input when one field has value
    // This mirrors your template behavior but controlled via reactive form
    this.email?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        const phone = this.phoneNumber!;
        if (val && String(val).trim().length > 0) phone.disable({ emitEvent: false });
        else phone.enable({ emitEvent: false });
      });

    this.phoneNumber?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        const email = this.email!;
        if (val && String(val).trim().length > 0) email.disable({ emitEvent: false });
        else email.enable({ emitEvent: false });
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // getters for template convenience
  get email() {
    return this.loginForm.get('email') as FormControl<string | null> | null;
  }

  get phoneNumber() {
    return this.loginForm.get('phoneNumber') as FormControl<string | null> | null;
  }

  async onLogin() {
    if (this.isLoading) return;

    this.loginForm.markAllAsTouched();

    // Access form-level validator using bracket notation
    if (this.loginForm.invalid) {
      if (this.loginForm.errors?.['atLeastOneRequired']) {
        await this.showToast('Please enter email or phone number', 'danger');
      } else if (this.email?.invalid && !this.phoneNumber?.value) {
        await this.showToast('Invalid email format', 'danger');
      } else if (this.phoneNumber?.invalid && !this.email?.value) {
        await this.showToast('Invalid phone number', 'danger');
      } else {
        await this.showToast('Please check the form and try again', 'danger');
      }
      return;
    }

    // Narrow values safely so `contact` is ALWAYS a string
    const emailVal = this.email?.value?.toString().trim() ?? null;
    const phoneVal = this.phoneNumber?.value?.toString().trim() ?? null;

    let contact: string;
    if (emailVal && emailVal.length > 0) {
      contact = emailVal;
    } else if (phoneVal && phoneVal.length > 0) {
      contact = phoneVal;
    } else {
      // Shouldn't happen due to validator, but keep safe
      await this.showToast('Please enter email or phone number', 'danger');
      return;
    }

    this.isLoading = true;
    this.errorMessage = undefined;
    this.successMessage = undefined;

    try {
      // If requestMagicLink returns Observable, use lastValueFrom
      const res = await lastValueFrom(this.authService.requestMagicLink(contact, 'login'));
      // Type-safe-ish access to response
      this.successMessage = (res as any)?.message ?? 'Token requested';
      await this.showToast(`Token sent to ${contact}`, 'success');
    } catch (e: unknown) {
      const err = e as any;
      console.error('Token request error:', err);
      this.errorMessage = err?.error?.message ?? err?.message ?? 'Failed to send token. Please try again.';
      // await this.showToast(this.errorMessage, 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  /** kept for backward compatibility if you prefer using subscribe */
  async requestToken(contact: string) {
    try {
      const res = await lastValueFrom(this.authService.requestMagicLink(contact, 'login'));
      this.successMessage = (res as any)?.message ?? 'Requested';
    } catch (e: unknown) {
      const err = e as any;
      this.errorMessage = err?.error?.message ?? err?.message ?? 'Something went wrong';
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning' | 'primary' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
      buttons: [{ text: 'Dismiss', role: 'cancel' }]
    });
    await toast.present();
  }
}

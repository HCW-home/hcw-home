import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
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
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TranslationService } from '../../core/services/translation.service';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';
import { AuthBrandingComponent } from '../../shared/components/auth-branding/auth-branding.component';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
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
    TranslatePipe,
    LanguageSelectorComponent, AuthBrandingComponent]
})
export class ForgotPasswordPage implements OnInit, OnDestroy {
  private t = inject(TranslationService);
  private destroy$ = new Subject<void>();
  forgotPasswordForm: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private route: ActivatedRoute
  ) {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.forgotPasswordForm.patchValue({ email });
    }

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onSubmit(): Promise<void> {
    if (this.forgotPasswordForm.valid) {
      this.isLoading = true;
      const { email } = this.forgotPasswordForm.value;

      this.authService.forgotPassword({ email })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async () => {
            this.isLoading = false;
            const toast = await this.toastCtrl.create({
              message: this.t.instant('forgotPassword.resetEmailSent'),
              duration: 4000,
              position: 'top',
              color: 'success'
            });
            await toast.present();
            this.navCtrl.navigateBack('/login');
          },
          error: async () => {
            this.isLoading = false;
            const toast = await this.toastCtrl.create({
              message: this.t.instant('forgotPassword.resetEmailFailed'),
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
    this.navCtrl.navigateBack('/login');
  }
}

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  isSubmitting = false;
  returnUrl: string;
  emailSent = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]]
    });
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/tabs/dashboard';
  }

  ngOnInit() {
    // Check if we have a token in the URL (magic link)
    const token = this.route.snapshot.queryParams['token'];
    if (token) {
      this.verifyMagicLink(token);
    }
  }

  onSubmit() {
    if (this.loginForm.invalid || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    const email = this.loginForm.get('email')?.value;

    this.authService.login(email).subscribe({
      next: () => {
        this.emailSent = true;
        this.isSubmitting = false;
      },
      error: async (error) => {
        this.isSubmitting = false;
        const toast = await this.toastController.create({
          message: 'Failed to send login link. Please try again.',
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        toast.present();
      }
    });
  }

  private verifyMagicLink(token: string) {
    this.isSubmitting = true;
    this.authService.verifyMagicLink(token).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.router.navigateByUrl(this.returnUrl);
      },
      error: async (error) => {
        this.isSubmitting = false;
        const toast = await this.toastController.create({
          message: 'Invalid or expired login link. Please try again.',
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        toast.present();
      }
    });
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}

import { Component, computed, effect, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { EnvironmentValidationService } from './services/environment-validation.service';
import { TermService } from './services/term.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {

  loginChecked = computed(() => this.authService.loginChecked());
  isLoggedIn = computed(() => this.authService.isLoggedIn());

  constructor(
    private environmentValidation: EnvironmentValidationService,
    private termService: TermService,
    private authService: AuthService
  ) { }

  async ngOnInit() {
    await this.environmentValidation.validateFullConfiguration();
      if (this.loginChecked() && this.isLoggedIn()) {
        this.loadLatestTerm();
      }
  }

  private loadLatestTerm() {
    this.termService.getLatestTermAndStore().subscribe({
      next: (term) => {
        if (!term) {
          console.warn('No latest term found.');
        } else {
          console.log('Latest term loaded:', term);
        }
      },
      error: (err) => {
        console.error('Error fetching latest term:', err);
      },
    });
  }
}

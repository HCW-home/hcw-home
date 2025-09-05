import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { EnvironmentValidationService } from './services/environment-validation.service';
import { TermService } from './services/term.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(
    private environmentValidation: EnvironmentValidationService,
    private termService: TermService
  ) { }

  async ngOnInit() {
    await this.environmentValidation.validateFullConfiguration();

    // Fetch and store latest terms
    this.termService.getLatestTermAndStore().subscribe({
      next: (term) => {
        if (term) {
          console.log('Latest term stored successfully:', term);
        } else {
          console.warn('No latest term found.');
        }
      },
      error: (err) => {
        console.error('Error fetching latest term:', err);
      }
    });
  }
}

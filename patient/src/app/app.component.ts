import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { TermService } from './services/term.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {

  constructor(
    private termService: TermService
  ) {}

 ngOnInit() {
    this.termService.getLatestTermAndStore().subscribe({
      next: (term) => {
        if (!term){
          console.warn('No latest term found.');
        }
      },
      error: (err) => {
        console.error('Error fetching latest term:', err);
      }
    });
  }

}

import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { ToastComponent } from './components/toast/toast.component';

@Component({
  selector: 'app-root',
  template: `
    <ion-app>
      <app-toast></app-toast>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet, ToastComponent],
})
export class AppComponent {
  constructor() {}
}

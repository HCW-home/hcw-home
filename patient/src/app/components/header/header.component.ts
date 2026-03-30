import { Component, Input ,OnInit} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonIcon, IonButton, IonButtons
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addCircleOutline } from 'ionicons/icons';
import { RoutePaths } from '../../constants/route-path.enum';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [CommonModule, IonTitle, IonHeader, IonToolbar, IonIcon, IonButton, IonButtons],
})
export class HeaderComponent  {
  
  constructor(
    private router: Router,
    private authService: AuthService
  ) {
    addIcons({ addCircleOutline });
  }
  @Input() title: string = "";
  @Input() showConsultationRequest: boolean = false;
  isLoggedIn: boolean = this.authService.isLoggedIn();

  goToConsultationRequest() {
    this.router.navigate([`/${RoutePaths.ConsultationRequest}`]);
  }
     goToProfile() {
    this.router.navigate([`/${RoutePaths.Profile}`]);
  }

}

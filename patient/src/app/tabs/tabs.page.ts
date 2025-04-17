import { Component } from '@angular/core';
import { 
  IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, 
  IonButton, Platform 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { triangle, ellipse, square, menu, close } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [
    IonTabs, IonTabBar, IonTabButton, 
    IonIcon, IonLabel, IonButton
  ]
})
export class TabsPage {
  sidebarCollapsed = false;
  isMobile = false;

  constructor(private platform: Platform) {
    addIcons({ triangle, ellipse, square, menu, close });
    this.checkPlatform();
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  private checkPlatform() {
    this.isMobile = this.platform.is('mobile');
    this.platform.resize.subscribe(() => {
      this.isMobile = this.platform.is('mobile');
    });
  }
}
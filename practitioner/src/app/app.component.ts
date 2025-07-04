import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { AngularSvgIconModule, SvgIconRegistryService } from 'angular-svg-icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    HttpClientModule,
    AngularSvgIconModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'practitioner';
  pendingConsultations: number | undefined = 5;
  activeConsultations: number | undefined = 0;
  isLoggedIn = true;

  private iconNames = ['warning', 'download', 'chevron-right','x'];

  constructor(private iconRegistry: SvgIconRegistryService) {}

  ngOnInit(): void {
    this.registerAllIcons();
  }

  private registerAllIcons(): void {
    this.iconNames.forEach((iconName) => {
      if (this.iconRegistry) {
        this.iconRegistry
          .loadSvg(`assets/svg/${iconName}.svg`, iconName)
          ?.subscribe({
            error: (error) =>
              console.error(`Failed to register icon ${iconName}:`, error),
          });
      }
    });
  }
}

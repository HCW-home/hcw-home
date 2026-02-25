import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonFooter,
  IonToolbar,
} from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-footer',
  templateUrl: './app-footer.component.html',
  styleUrls: ['./app-footer.component.scss'],
  standalone: true,
  imports: [CommonModule, IonFooter, IonToolbar],
})
export class AppFooterComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  footerHtml = signal<string | null>(null);

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.getConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (config) => {
          this.footerHtml.set(config?.main_organization?.footer_patient || null);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

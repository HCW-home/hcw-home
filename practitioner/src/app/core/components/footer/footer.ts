import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { UserService } from '../../services/user.service';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-footer',
  imports: [CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private userService = inject(UserService);
  private authService = inject(Auth);

  footerHtml = signal<string | null>(null);

  ngOnInit(): void {
    this.userService
      .getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: user => {
          const footer = user?.main_organisation?.footer_practitioner;
          if (footer) {
            this.footerHtml.set(footer);
          } else {
            this.loadFromConfig();
          }
        },
      });
  }

  private loadFromConfig(): void {
    this.authService
      .getOpenIDConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: config => {
          this.footerHtml.set(config?.main_organization?.footer_practitioner || null);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

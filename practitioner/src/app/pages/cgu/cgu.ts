import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, switchMap, forkJoin, of } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { UserService } from '../../core/services/user.service';
import { TermsService } from '../../core/services/terms.service';
import { ToasterService } from '../../core/services/toaster.service';
import { TranslationService } from '../../core/services/translation.service';
import { Auth } from '../../core/services/auth';
import { ITerm } from '../../modules/user/models/user';
import { RoutePaths } from '../../core/constants/routes';
import { Typography } from '../../shared/ui-components/typography/typography';
import { LanguageSelector } from '../../shared/components/language-selector/language-selector';
import { Loader } from '../../shared/components/loader/loader';
import { TypographyTypeEnum } from '../../shared/constants/typography';

@Component({
  selector: 'app-cgu',
  standalone: true,
  imports: [FormsModule, Typography, LanguageSelector, Loader, TranslatePipe],
  templateUrl: './cgu.html',
  styleUrl: './cgu.scss',
})
export class CguPage implements OnInit, OnDestroy {
  private router = inject(Router);
  private userService = inject(UserService);
  private termsService = inject(TermsService);
  private authService = inject(Auth);
  private toasterService = inject(ToasterService);
  private t = inject(TranslationService);
  private destroy$ = new Subject<void>();

  TypographyTypeEnum = TypographyTypeEnum;

  term: ITerm | null = null;
  loading = true;
  accepting = false;
  accepted = false;

  ngOnInit(): void {
    this.loadTerm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadTerm(): void {
    forkJoin({
      user: this.userService.getCurrentUser(),
      config: this.authService.getOpenIDConfig()
    })
      .pipe(
        takeUntil(this.destroy$),
        switchMap(({ user, config }) => {
          // Load available languages
          if (config.languages?.length) {
            this.t.loadLanguages(config.languages);
          }

          let termId = user.main_organisation?.default_term;

          // If user's organization doesn't have a default term, check the config
          if (termId == null) {
            termId = config.main_organization?.default_term;
          }

          if (!termId) {
            this.router.navigate([`/${RoutePaths.USER}`]);
            return of(null);
          }
          return this.termsService.getTerm(termId);
        })
      )
      .subscribe({
        next: term => {
          if (term) {
            this.term = term;
          }
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.toasterService.show('error', this.t.instant('cgu.title'), this.t.instant('cgu.loadError'));
        },
      });
  }

  onAccept(): void {
    if (!this.term) return;

    this.accepting = true;
    this.termsService
      .acceptTerm(this.term.id)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.userService.getCurrentUser(true))
      )
      .subscribe({
        next: () => {
          this.router.navigate([`/${RoutePaths.USER}`]);
        },
        error: () => {
          this.accepting = false;
          this.toasterService.show('error', this.t.instant('cgu.title'), this.t.instant('cgu.acceptError'));
        },
      });
  }
}

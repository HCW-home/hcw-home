import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';

import { UserService } from '../../core/services/user.service';
import { Auth } from '../../core/services/auth';
import { ToasterService } from '../../core/services/toaster.service';
import { TranslationService } from '../../core/services/translation.service';
import { ThemeService } from '../../core/services/theme.service';
import { RoutePaths } from '../../core/constants/routes';
import { IUserUpdateRequest } from '../../modules/user/models/user';
import { CommunicationMethodEnum } from '../../modules/user/constants/user';
import { SelectOption } from '../../shared/models/select';
import { TIMEZONE_OPTIONS } from '../../shared/constants/timezone';

import { Typography } from '../../shared/ui-components/typography/typography';
import { Button } from '../../shared/ui-components/button/button';
import { Select } from '../../shared/ui-components/select/select';
import { Loader } from '../../shared/components/loader/loader';
import { TypographyTypeEnum } from '../../shared/constants/typography';
import { ButtonTypeEnum, ButtonStyleEnum } from '../../shared/constants/button';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    Typography,
    Button,
    Select,
    Loader,
  ],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class OnboardingPage implements OnInit, OnDestroy {
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private userService = inject(UserService);
  private authService = inject(Auth);
  private toasterService = inject(ToasterService);
  private t = inject(TranslationService);
  private themeService = inject(ThemeService);
  private destroy$ = new Subject<void>();

  TypographyTypeEnum = TypographyTypeEnum;
  ButtonTypeEnum = ButtonTypeEnum;
  ButtonStyleEnum = ButtonStyleEnum;

  onboardingForm!: FormGroup;
  loading = true;
  saving = signal(false);

  siteLogoWhite: string | null = null;
  branding = 'HCW@Home';

  timezoneOptions: SelectOption[] = TIMEZONE_OPTIONS;
  preferredLanguageOptions = signal<SelectOption[]>([]);

  get communicationMethods(): SelectOption[] {
    return [
      {
        label: this.t.instant('userProfile.commSms'),
        value: CommunicationMethodEnum.SMS,
      },
      {
        label: this.t.instant('userProfile.commEmail'),
        value: CommunicationMethodEnum.EMAIL,
      },
      // {
      //   label: this.t.instant('userProfile.commWhatsApp'),
      //   value: CommunicationMethodEnum.WHATSAPP,
      // },
      // {
      //   label: this.t.instant('userProfile.commPush'),
      //   value: CommunicationMethodEnum.PUSH,
      // },
      {
        label: this.t.instant('userProfile.commNone'),
        value: CommunicationMethodEnum.MANUAL,
      },
    ];
  }

  ngOnInit(): void {
    this.onboardingForm = this.fb.group({
      communication_method: ['email', [Validators.required]],
      timezone: [
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [Validators.required],
      ],
      preferred_language: [null],
      mobile_phone_number: [''],
    });

    this.onboardingForm
      .get('preferred_language')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(lang => {
        if (lang) {
          this.t.setLanguage(lang);
        }
      });

    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadData(): void {
    forkJoin({
      config: this.authService.getOpenIDConfig(),
      user: this.userService.getCurrentUser(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ config, user }) => {
          this.siteLogoWhite = config.main_organization?.logo_white || null;
          if (config.branding) {
            this.branding = config.branding;
          }
          if (config.primary_color_practitioner) {
            this.themeService.applyPrimaryColor(config.primary_color_practitioner);
          }
          this.preferredLanguageOptions.set(
            (config.languages || []).map(lang => {
              const nativeName = new Intl.DisplayNames([lang.code], {
                type: 'language',
              }).of(lang.code);
              const label = nativeName
                ? nativeName.charAt(0).toUpperCase() + nativeName.slice(1)
                : lang.name;
              return { label, value: lang.code };
            })
          );
          // Get current language from TranslationService (might have been changed in CGU page)
          const currentLang = this.t.getCurrentLanguage();

          this.onboardingForm.patchValue({
            communication_method: user.communication_method || 'email',
            timezone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              user.timezone ||
              'UTC',
            preferred_language: currentLang?.code || null,
            mobile_phone_number: user.mobile_phone_number || '',
          });
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  save(): void {
    if (this.onboardingForm.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    const formValue = this.onboardingForm.value;

    const updateData: IUserUpdateRequest = {
      communication_method: formValue.communication_method,
      timezone: formValue.timezone,
      preferred_language: formValue.preferred_language,
      mobile_phone_number: formValue.mobile_phone_number || undefined,
      is_first_login: false,
    };

    this.userService
      .updateCurrentUser(updateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.saving.set(false);
          if (formValue.preferred_language) {
            this.t.setLanguage(formValue.preferred_language);
          }
          localStorage.setItem('show_onboarding_hint', 'true');
          this.router.navigate([`/${RoutePaths.USER}`]);
        },
        error: () => {
          this.saving.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('onboarding.errorTitle'),
            this.t.instant('onboarding.errorMessage')
          );
        },
      });
  }
}

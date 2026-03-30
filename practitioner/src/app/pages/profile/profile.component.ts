import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { LanguageService } from '../../services/language.service';
import { SpecialityService } from '../../services/speciality.service';
import { ToastService } from '../../services/toast/toast.service';
import { User, UserSex, Language, Speciality, UpdateUserProfileDto } from '../../models/user.model';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { ButtonVariant, ButtonSize, ButtonType } from '../../constants/button.enums';
import { ConfigService } from '../../services/config.service';
import { AuthService } from '../../auth/auth.service';
import { SnackbarService } from '../../services/snackbar/snackbar.service';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { NotificationService } from '../../services/notification.service';
import { NotificationSettings } from '../../services/notification.service';

const PHONE_NUMBER_REGEX = /^\+[1-9][\d\s\-\(\)]{7,14}$/;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;



const GENDER_OPTIONS = [
  { value: UserSex.MALE, label: 'Male' },
  { value: UserSex.FEMALE, label: 'Female' },
  { value: UserSex.OTHER, label: 'Other' }
] as const;

interface CountryOption {
  readonly code: string;
  readonly name: string;
}

interface GenderOption {
  readonly value: UserSex;
  readonly label: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatIconModule,
    ButtonComponent,
    MatSlideToggle
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly notificationService = inject(NotificationService);
  private readonly languageService = inject(LanguageService);
  private readonly specialityService = inject(SpecialityService);
  private readonly configService = inject(ConfigService)
  private readonly authservice = inject(AuthService)
  private readonly snackBarService = inject(SnackbarService)
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();
  readonly profileForm: FormGroup;
  readonly currentUser = signal<User | null>(null);
  readonly languages = signal<Language[]>([]);
  readonly specialities = signal<Speciality[]>([]);
  readonly countries = signal<CountryOption[]>([]);
  readonly genderOptions: readonly GenderOption[] = GENDER_OPTIONS;

  readonly isLoading = signal<boolean>(true);
  readonly isSaving = signal<boolean>(false);

  readonly isFormValid = computed(() => this.profileForm?.valid ?? false);
  readonly hasUnsavedChanges = computed(() => this.profileForm?.dirty && !this.isSaving());

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;

  constructor() {
    this.profileForm = this.createProfileForm();
  }




  ngOnInit(): void {
    this.loadProfileData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createProfileForm(): FormGroup {
    return this.fb.group({
      firstName: ['', [
        Validators.required,
        Validators.minLength(MIN_NAME_LENGTH),
        Validators.maxLength(MAX_NAME_LENGTH)
      ]],
      lastName: ['', [
        Validators.required,
        Validators.minLength(MIN_NAME_LENGTH),
        Validators.maxLength(MAX_NAME_LENGTH)
      ]],
      phoneNumber: ['', [Validators.pattern(PHONE_NUMBER_REGEX)]],
      country: [''],
      sex: [''],
      notificationsEnabled: [true],
      notificationPhoneNumber: ['', [Validators.pattern(PHONE_NUMBER_REGEX)]],
      practitioner_languages: [[]],
      practitioner_specialities: [[]]
    });
  }

  loadProfileData(): void {
    this.isLoading.set(true);
    const user = this.authservice.getCurrentUser();
    this.currentUser.set(user);

    forkJoin({
      languages: this.languageService.getAllLanguages().pipe(
        catchError(error => {
          console.error('Error loading languages:', error);
          this.toastService.showError('Failed to load languages');
          return of([]);
        })
      ),
      specialities: this.specialityService.getAllSpecialities().pipe(
        catchError(error => {
          console.error('Error loading specialities:', error);
          this.toastService.showError('Failed to load specialities');
          return of([]);
        })
      ),
      countries: this.configService.getCountries().pipe(
        catchError(error => {
          console.error('Error loading specialities:', error);
          this.toastService.showError('Failed to load countries');
          return of([]);
        })
      )
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: ({ languages, specialities, countries }) => {
        this.languages.set(languages);
        this.specialities.set(specialities);
        this.countries.set(countries)
        if (user) {
          this.populateForm(user);
        }
      },
      error: (error) => {
        console.error('Error loading profile data:', error);
        this.toastService.showError('Failed to load profile data');
      }
    });
  }

  private populateForm(user: User): void {
    this.profileForm.patchValue({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber || '',
      country: user.country || '',
      sex: user.sex || '',
      practitioner_languages: user.languages?.map(l => l.id) || [],
      practitioner_specialities: user.specialities?.map(l => l.id) || [],
      notificationsEnabled: user.UserNotificationSetting?.enabled ?? true,
      notificationPhoneNumber: user.UserNotificationSetting?.phone || '',
    });
    this.setupNotificationValidation()
    this.setDefaultPhone()
  }
  private setDefaultPhone(): void {
    const notificationPhoneControl = this.profileForm.get('notificationPhoneNumber');
    const phoneControl = this.profileForm.get('phoneNumber');

    if (notificationPhoneControl && phoneControl) {
      // If notificationPhoneNumber is empty or null, set it to phoneNumber
      if (!notificationPhoneControl.value && phoneControl.value) {
        notificationPhoneControl.setValue(phoneControl.value);
      }
    }
  }

  private setupNotificationValidation(): void {
    const notificationEnabledControl = this.profileForm.get('notificationsEnabled');
    const notificationPhoneControl = this.profileForm.get('notificationPhoneNumber');

    const applyValidators = (enabled: boolean) => {
      if (enabled) {
        notificationPhoneControl?.setValidators([
          Validators.required,
          Validators.pattern(PHONE_NUMBER_REGEX)
        ]);
      } else {
        notificationPhoneControl?.clearValidators();
      }
      notificationPhoneControl?.updateValueAndValidity();
    };

    notificationEnabledControl?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(applyValidators);

    applyValidators(notificationEnabledControl?.value);
  }



  onSave(): void {
    if (!this.currentUser()) {
      this.markFormGroupTouched();
      return;
    }
    this.isSaving.set(true);
    const formValue = this.profileForm.value;
    const user = this.currentUser()!;
    const updateData: UpdateUserProfileDto = {
      firstName: formValue.firstName?.trim(),
      lastName: formValue.lastName?.trim(),
      phoneNumber: formValue.phoneNumber?.trim() || null,
      country: formValue.country || null,
      sex: formValue.sex || null,
      languageIds: formValue.practitioner_languages || [],
      specialityIds: formValue.practitioner_specialities || []
    };
    // Prepare notification settings
    const notificationSettings: NotificationSettings = {
      enabled: formValue.notificationsEnabled,
      phone: formValue.notificationPhoneNumber?.trim() || null
    };


    forkJoin([
      this.authservice.updateProfile(updateData),
      this.notificationService.updateNotificationSettings(notificationSettings)
    ]).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSaving.set(false);
        this.profileForm.enable();
      })
    ).subscribe({
      next: ([updatedUser, updatedNotifications]) => {
        this.snackBarService.showSuccess('Profile updated successfully');

        const existingUser = this.authservice.getCurrentUser();
        if (existingUser) {
          const loginUser: User = {
            ...updatedUser,
            accessToken: existingUser.accessToken,
            refreshToken: existingUser.refreshToken,
          };
          this.authservice.storeCurrentUser(loginUser);
        }

        this.currentUser.set(updatedUser);
        this.populateForm(updatedUser);
        this.profileForm.markAsPristine();
      },
      error: (error) => {
        if (error.error.error?.validationErrors) {
          const firstKey = Object.keys(error.error.error.validationErrors)[0];
          const firstError = error.error.error.validationErrors[firstKey][0];
          this.snackBarService.showError(firstError);
        } else {
          this.snackBarService.showError(error.error?.message || 'Something went wrong');
        }
      }
    });

  }

  onReset(): void {
    const user = this.currentUser();
    if (user) {
      this.populateForm(user);
      this.profileForm.markAsPristine();
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.profileForm.controls).forEach(key => {
      const control = this.profileForm.get(key);
      if (control) {
        control.markAsTouched();
      }
    });
  }

  trackByLanguageId = (index: number, language: Language): number => language.id;
  trackBySpecialityId = (index: number, speciality: Speciality): number => speciality.id;
  trackByCountryCode = (index: number, country: CountryOption): string => country.code;
  trackByGenderValue = (index: number, gender: GenderOption): UserSex => gender.value;

  get firstName(): FormControl { return this.profileForm.get('firstName') as FormControl; }
  get lastName(): FormControl { return this.profileForm.get('lastName') as FormControl; }
  get phoneNumber(): FormControl { return this.profileForm.get('phoneNumber') as FormControl; }
  get country(): FormControl { return this.profileForm.get('country') as FormControl; }
  get sex(): FormControl { return this.profileForm.get('sex') as FormControl; }
  get practitioner_languages(): FormControl { return this.profileForm.get('practitioner_languages') as FormControl; }
  get practitioner_specialities(): FormControl { return this.profileForm.get('practitioner_specialities') as FormControl; }
  get notificationsEnabled(): FormControl { return this.profileForm.get('notificationsEnabled') as FormControl; }
  get notificationPhoneNumber(): FormControl { return this.profileForm.get('notificationPhoneNumber') as FormControl }
}

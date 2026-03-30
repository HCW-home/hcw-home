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

import { User, UserSex, Language, Speciality, UpdateUserProfileDto, LoginUser } from '../../models/user.model';
import { AuthService } from 'src/app/services/auth.service';
import { ButtonVariant, ButtonSize, ButtonType } from 'src/app/constants/button.enums';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { LanguageService } from 'src/app/services/language.service';
import { ConfigService } from 'src/app/services/config.service';
import { SnackbarService } from 'src/app/services/snackbar.service';
import { UserService } from 'src/app/services/user.service';

const PHONE_NUMBER_REGEX = /^[+]?[1-9][\d\s\-\(\)]{7,15}$/;
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
    ButtonComponent
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly languageService = inject(LanguageService);
  private readonly configService = inject(ConfigService);
  private readonly authservice = inject(AuthService);
  private readonly snackBarService = inject(SnackbarService);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  readonly profileForm: FormGroup;
  readonly currentUser = signal<User | null>(null);
  readonly languages = signal<Language[]>([]);
  readonly specialities = signal<Speciality[]>([]);
  readonly countries = signal<CountryOption[]>([]);
  readonly genderOptions: readonly GenderOption[] = GENDER_OPTIONS;

  readonly isLoading = signal<boolean>(true);
  readonly isSaving = signal<boolean>(false);

  readonly formValid = signal<boolean>(false);
  readonly hasUnsavedChanges = computed(() => this.profileForm?.dirty && !this.isSaving());

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;

  showEmailField = false;

  constructor() {
    this.profileForm = this.createProfileForm();
  }

  ngOnInit(): void {
    this.formValid.set(this.profileForm.valid);
    this.profileForm.statusChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.formValid.set(this.profileForm.valid));
  
    this.loadProfileData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createProfileForm(): FormGroup {
    return this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(MIN_NAME_LENGTH), Validators.maxLength(MAX_NAME_LENGTH)]],
      lastName: ['', [Validators.required, Validators.minLength(MIN_NAME_LENGTH), Validators.maxLength(MAX_NAME_LENGTH)]],
      phoneNumber: ['', [Validators.pattern(PHONE_NUMBER_REGEX)]],
      country: [''],
      sex: [''],
      practitioner_languages: [[]],
      practitioner_specialities: [[]],
      email: ['']
    });
  }

  private isTemporaryEmail(email?: string | null): boolean {
    return email ? /^\s*temp(_|-|orary)?/i.test(email) : false;
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
    });

    const email = user.email ?? '';
    this.showEmailField = this.isTemporaryEmail(email);

    const emailControl = this.profileForm.get('email');
    if (this.showEmailField) {
      emailControl?.setValidators([Validators.required, Validators.email, Validators.maxLength(255)]);
    } else {
      emailControl?.clearValidators();
    }
    emailControl?.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }

  loadProfileData(): void {
    this.isLoading.set(true);
    forkJoin({
      user: this.userService.getCurrentUser().pipe(
        catchError(() => {
          this.snackBarService.showError('Failed to load user profile');
          return of(null);
        })
      ),
      languages: this.languageService.getAllLanguages().pipe(
        catchError(() => {
          this.snackBarService.showError('Failed to load languages');
          return of([]);
        })
      ),
      countries: this.configService.getCountries().pipe(
        catchError(() => {
          this.snackBarService.showError('Failed to load countries');
          return of([]);
        })
      )
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: ({ user, languages, countries }) => {
        this.currentUser.set(user);
        this.languages.set(languages);
        this.countries.set(countries);
        if (user) this.populateForm(user);
      },
      error: (err) => {this.snackBarService.showError('Failed to load profile data')
        console.error('Profile data load error:', err);
      }
    });
  }

  onSave(): void {
    if (!this.formValid() || !this.currentUser()) {
      this.markFormGroupTouched();
      return;
    }
    this.isSaving.set(true);
    this.profileForm.disable();

    const formValue = this.profileForm.value;
    const user = this.currentUser()!;

    const updateData: UpdateUserProfileDto = {
      firstName: formValue.firstName?.trim(),
      lastName: formValue.lastName?.trim(),
      phoneNumber: formValue.phoneNumber?.trim() || null,
      country: formValue.country || null,
      sex: formValue.sex || null,
      languageIds: formValue.practitioner_languages || [],
      specialityIds: formValue.practitioner_specialities || [],
      email: this.showEmailField ? formValue.email?.trim() || null : user.email
    };

    this.userService.updateUserProfile(updateData).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSaving.set(false);
        this.profileForm.enable();
      })
    ).subscribe({
      next: (updatedUser) => {
        this.snackBarService.showSuccess('Profile updated successfully');
        const existingUser = this.authservice.getCurrentUser();
        if (existingUser) {
          const loginUser: LoginUser = {
            ...updatedUser,
            accessToken: existingUser.accessToken,
            refreshToken: existingUser.refreshToken,
          };
          this.authservice.storeCurrentUser(loginUser);
        }
        this.currentUser.set(updatedUser);
        this.profileForm.markAsPristine();
      },
      error: (err) => {
        this.snackBarService.showError(err.error?.message || 'Failed to update profile. Please try again.')
        console.error('Profile update error:', err);
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
  onLogout(): void {
    this.authservice.logout();
  }

  private markFormGroupTouched(): void {
    Object.keys(this.profileForm.controls).forEach(key => {
      this.profileForm.get(key)?.markAsTouched();
    });
  }

  trackByLanguageId = (_: number, language: Language): number => language.id;
  trackBySpecialityId = (_: number, speciality: Speciality): number => speciality.id;
  trackByCountryCode = (_: number, country: CountryOption): string => country.code;
  trackByGenderValue = (_: number, gender: GenderOption): UserSex => gender.value;

  get firstName(): FormControl { return this.profileForm.get('firstName') as FormControl; }
  get lastName(): FormControl { return this.profileForm.get('lastName') as FormControl; }
  get phoneNumber(): FormControl { return this.profileForm.get('phoneNumber') as FormControl; }
  get country(): FormControl { return this.profileForm.get('country') as FormControl; }
  get sex(): FormControl { return this.profileForm.get('sex') as FormControl; }
  get practitioner_languages(): FormControl { return this.profileForm.get('practitioner_languages') as FormControl; }
  get practitioner_specialities(): FormControl { return this.profileForm.get('practitioner_specialities') as FormControl; }
}

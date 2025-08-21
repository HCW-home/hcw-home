import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { of, throwError, Subject } from 'rxjs';

import { ProfileComponent } from './profile.component';
import { UserService } from '../../services/user.service';
import { LanguageService } from '../../services/language.service';
import { SpecialityService } from '../../services/speciality.service';
import { ToastService } from '../../services/toast/toast.service';
import { User, UserRole, UserSex, UserStatus, Language, Speciality, UpdateUserProfileDto } from '../../models/user.model';

const MOCK_USER: User = {
  id: 1,
  role: UserRole.PRACTITIONER,
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  temporaryAccount: false,
  phoneNumber: '+1234567890',
  country: 'US',
  sex: UserSex.MALE,
  status: UserStatus.APPROVED,
  createdAt: new Date('2023-01-01'),
  updatedAt: new Date('2023-01-02'),
  languageIds: [1, 2],
  specialityIds: [1],
  organizations: [{ id: 1, name: 'Test Hospital', createdAt: new Date(), updatedAt: new Date() }],
  groups: [{ id: 1, name: 'Emergency', organizationId: 1, sharedOnlyIncomingConsultation: false, createdAt: new Date(), updatedAt: new Date() }]
};

const MOCK_LANGUAGES: Language[] = [
  { id: 1, name: 'English', code: 'en', createdAt: new Date(), updatedAt: new Date() },
  { id: 2, name: 'Spanish', code: 'es', createdAt: new Date(), updatedAt: new Date() },
  { id: 3, name: 'French', code: 'fr', createdAt: new Date(), updatedAt: new Date() }
];

const MOCK_SPECIALITIES: Speciality[] = [
  { id: 1, name: 'Cardiology', description: 'Heart specialist', createdAt: new Date(), updatedAt: new Date() },
  { id: 2, name: 'Dermatology', description: 'Skin specialist', createdAt: new Date(), updatedAt: new Date() },
  { id: 3, name: 'Neurology', description: 'Brain specialist', createdAt: new Date(), updatedAt: new Date() }
];

class MockUserService {
  getCurrentUser = jasmine.createSpy('getCurrentUser').and.returnValue(of(MOCK_USER));
  updateUserProfile = jasmine.createSpy('updateUserProfile').and.returnValue(of(MOCK_USER));
  getUserById = jasmine.createSpy('getUserById').and.returnValue(of(MOCK_USER));
}

class MockLanguageService {
  getAllLanguages = jasmine.createSpy('getAllLanguages').and.returnValue(of(MOCK_LANGUAGES));
  getLanguageById = jasmine.createSpy('getLanguageById').and.returnValue(of(MOCK_LANGUAGES[0]));
}

class MockSpecialityService {
  getAllSpecialities = jasmine.createSpy('getAllSpecialities').and.returnValue(of(MOCK_SPECIALITIES));
  getSpecialityById = jasmine.createSpy('getSpecialityById').and.returnValue(of(MOCK_SPECIALITIES[0]));
}

class MockToastService {
  showSuccess = jasmine.createSpy('showSuccess');
  showError = jasmine.createSpy('showError');
  show = jasmine.createSpy('show');
}

function createTestBed(): void {
  TestBed.configureTestingModule({
    imports: [
      ProfileComponent,
      ReactiveFormsModule,
      NoopAnimationsModule,
      MatFormFieldModule,
      MatInputModule,
      MatSelectModule,
      MatButtonModule,
      MatCardModule,
      MatProgressSpinnerModule,
      MatChipsModule,
      MatIconModule
    ],
    providers: [
      FormBuilder,
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: UserService, useClass: MockUserService },
      { provide: LanguageService, useClass: MockLanguageService },
      { provide: SpecialityService, useClass: MockSpecialityService },
      { provide: ToastService, useClass: MockToastService }
    ]
  });
}

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let userServiceSpy: MockUserService;
  let languageServiceSpy: MockLanguageService;
  let specialityServiceSpy: MockSpecialityService;
  let toastServiceSpy: MockToastService;
  let httpMock: HttpTestingController;

  beforeEach(waitForAsync(() => {
    createTestBed();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    userServiceSpy = TestBed.inject(UserService) as jasmine.SpyObj<UserService> & MockUserService;
    languageServiceSpy = TestBed.inject(LanguageService) as jasmine.SpyObj<LanguageService> & MockLanguageService;
    specialityServiceSpy = TestBed.inject(SpecialityService) as jasmine.SpyObj<SpecialityService> & MockSpecialityService;
    toastServiceSpy = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService> & MockToastService;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    fixture.destroy();
  });

  describe('Component Creation', () => {
    it('should create component successfully', () => {
      
      expect(component).toBeTruthy();
      expect(component).toBeInstanceOf(ProfileComponent);
    });

    it('should initialize with default state', () => {
      
      expect(component.isLoading()).toBe(true);
      expect(component.isSaving()).toBe(false);
      expect(component.currentUser()).toBeNull();
      expect(component.languages()).toEqual([]);
      expect(component.specialities()).toEqual([]);
    });

    it('should create form with correct validators', () => {
      
      expect(component.profileForm).toBeTruthy();
      expect(component.firstName.hasError('required')).toBe(true);
      expect(component.lastName.hasError('required')).toBe(true);
    });
  });

  describe('Data Loading', () => {
    it('should load profile data successfully on init', waitForAsync(() => {
    
      spyOn(component, 'loadProfileData').and.callThrough();

      component.ngOnInit();
      fixture.detectChanges();

      expect(component.loadProfileData).toHaveBeenCalled();
    }));

    it('should load user, languages, and specialities in parallel', waitForAsync(() => {

      component.loadProfileData();
      fixture.detectChanges();

      expect(userServiceSpy.getCurrentUser).toHaveBeenCalled();
      expect(languageServiceSpy.getAllLanguages).toHaveBeenCalled();
      expect(specialityServiceSpy.getAllSpecialities).toHaveBeenCalled();
      
      setTimeout(() => {
        expect(component.currentUser()).toEqual(MOCK_USER);
        expect(component.languages()).toEqual(MOCK_LANGUAGES);
        expect(component.specialities()).toEqual(MOCK_SPECIALITIES);
        expect(component.isLoading()).toBe(false);
      }, 0);
    }));

    it('should handle user loading error gracefully', waitForAsync(() => {
      userServiceSpy.getCurrentUser.and.returnValue(throwError(() => new Error('User load failed')));

      component.loadProfileData();
      fixture.detectChanges();

      setTimeout(() => {
        expect(toastServiceSpy.showError).toHaveBeenCalledWith('Failed to load user profile');
        expect(component.currentUser()).toBeNull();
        expect(component.isLoading()).toBe(false);
      }, 0);
    }));
  });

  describe('Form Submission', () => {
    beforeEach(() => {
      component.currentUser.set(MOCK_USER);
      component['populateForm'](MOCK_USER);
      fixture.detectChanges();
    });

    it('should save profile successfully', waitForAsync(() => {

      fixture.detectChanges(); 
      
      const updatedData: UpdateUserProfileDto = {
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '+9876543210'
      };
      
      expect(component.currentUser()).toEqual(MOCK_USER);
      
      component.profileForm.patchValue(updatedData);
      fixture.detectChanges(); 
      
      const updatedUser = { ...MOCK_USER, ...updatedData };
      userServiceSpy.updateUserProfile.and.returnValue(of(updatedUser));
      component.onSave();

      expect(userServiceSpy.updateUserProfile).toHaveBeenCalledWith(MOCK_USER.id, jasmine.objectContaining({
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '+9876543210'
      }));
      expect(toastServiceSpy.showSuccess).toHaveBeenCalledWith('Profile updated successfully');
      expect(component.isSaving()).toBe(false);
      expect(component.currentUser()).toEqual(updatedUser);
    }));

    it('should not save if form is invalid', () => {
      component.currentUser.set(MOCK_USER);
      
      component.profileForm.patchValue({ firstName: '', lastName: '' });
      
      expect(component.isFormValid()).toBe(false);

      component.onSave();

      expect(userServiceSpy.updateUserProfile).not.toHaveBeenCalled();
      expect(component.firstName.touched).toBe(true);
      expect(component.lastName.touched).toBe(true);
    });
  });

  describe('TrackBy Functions', () => {
    it('should track languages by id', () => {
      expect(component.trackByLanguageId(0, MOCK_LANGUAGES[0])).toBe(1);
      expect(component.trackByLanguageId(1, MOCK_LANGUAGES[1])).toBe(2);
    });

    it('should track specialities by id', () => {
      expect(component.trackBySpecialityId(0, MOCK_SPECIALITIES[0])).toBe(1);
      expect(component.trackBySpecialityId(1, MOCK_SPECIALITIES[1])).toBe(2);
    });
  });

  describe('Computed Properties', () => {
    it('should compute form validity correctly', () => {
      
      component.profileForm.patchValue({
        firstName: 'John',
        lastName: 'Doe'
      });

      expect(component.isFormValid()).toBe(true);

      component.profileForm.patchValue({ firstName: '' });
      expect(component.isFormValid()).toBe(false);
    });
  });
});

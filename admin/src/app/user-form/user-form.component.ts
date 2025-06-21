import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../services/user.service';
import { OrganizationService } from '../services/organization.service';
import { GroupService } from '../services/group.service';
import { LanguageService } from '../services/language.service';
import { SpecialityService } from '../services/speciality.service';
import { CreateUserDto, UpdateUserDto, User, UserRole, UserStatus, UserSex, Organization, Group, Language, Speciality } from '../models/user.model';
import { Observable, Subscription, forkJoin } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar'
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.scss']
})
export class UserFormComponent implements OnInit, OnDestroy {
  userForm!: FormGroup;
  userId: number | null = null;
  isEditMode: boolean = false;
  loading: boolean = false;

  organizations: Organization[] = [];
  groups: Group[] = [];
  languages: Language[] = [];
  specialities: Speciality[] = [];

  userRoles = Object.values(UserRole);
  userStatuses = Object.values(UserStatus);
  userSexes = Object.values(UserSex);

  private subscriptions: Subscription = new Subscription();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private organizationService: OrganizationService,
    private groupService: GroupService,
    private languageService: LanguageService,
    private specialityService: SpecialityService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.subscriptions.add(
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        this.userId = id ? +id : null;
        this.isEditMode = !!this.userId;
        this.initForm();
        this.loadFormData();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  initForm(): void {
    this.userForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s]+$/)]],
      lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s]+$/)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      role: [UserRole.PATIENT, Validators.required],
      status: [UserStatus.NOT_APPROVED, Validators.required],
      temporaryAccount: [false],
      phoneNumber: ['', [Validators.pattern(/^\+?[1-9]\d{1,14}$/)]],
      country: ['', [Validators.minLength(2), Validators.maxLength(100)]],
      sex: [UserSex.MALE],
      organisationIds: [[] as number[], Validators.required],
      groupIds: [[] as number[]],
      languageIds: [[] as number[]],
      specialityIds: [[] as number[]]
    });
  }

  loadFormData(): void {
    this.loading = true;

    const orgs$ = this.organizationService.getAllOrganizations();
    const languages$ = this.languageService.getAllLanguages();
    const specialities$ = this.specialityService.getAllSpecialities();

    const observables: Observable<any>[] = [orgs$, languages$, specialities$];

    if (this.isEditMode && this.userId !== null) {
      observables.push(this.userService.getUserById(this.userId));
    }

    this.subscriptions.add(
      forkJoin(observables).subscribe({
        next: (results: any[]) => {
          this.organizations = results[0];
          this.languages = results[1];
          this.specialities = results[2];

          if (this.isEditMode && this.userId !== null && results.length > 3 && results[3]) {
            const userData: User = results[3];
            this.userForm.patchValue({
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              role: userData.role,
              status: userData.status,
              temporaryAccount: userData.temporaryAccount,
              phoneNumber: userData.phoneNumber,
              country: userData.country,
              sex: userData.sex,
              organisationIds: userData.organizations.map(org => org.id),
              groupIds: userData.groups.map(group => group.id),
              languageIds: userData.spokenLanguages.map(lang => lang.id),
              specialityIds: userData.userSpecialities.map(spec => spec.id)
            });

            const orgIds = userData.organizations.map(org => org.id);
            this.loadGroupsForOrganizations(orgIds);
          }

          this.userForm.get('organisationIds')?.valueChanges.subscribe((orgIds: number[]) => {
            this.loadGroupsForOrganizations(orgIds);
          });

          this.loading = false;
        },
        error: (error: any) => {
          console.error('Error loading form data:', error);
          alert(`Failed to load form data: ${error.message || 'Unknown error'}`);
          this.loading = false;
        }
      })
    );
  }

  loadGroupsForOrganizations(orgIds: number[]): void {
    this.groups = [];
    if (!orgIds || orgIds.length === 0) {
      return;
    }

    const groupRequests = orgIds.map(id => this.groupService.getGroupsByOrganization(id));

    this.subscriptions.add(
      forkJoin(groupRequests).subscribe({
        next: (groupLists: Group[][]) => {
          const allGroups = groupLists.flat();
          const uniqueGroups = allGroups.filter(
            (group, index, self) => index === self.findIndex(g => g.id === group.id)
          );
          this.groups = uniqueGroups;
        },
        error: err => {
          console.error('Failed to load groups for selected organizations', err);
          this.groups = [];
        }
      })
    );
  }

  onSubmit(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      alert('Please fill out all required fields and correct any errors.');
      return;
    }

    this.loading = true;
    const formValue = this.userForm.value;

    let payload: CreateUserDto | UpdateUserDto;

    if (this.isEditMode) {
      payload = { ...formValue } as UpdateUserDto;
    } else {
      payload = {
        ...(formValue as CreateUserDto),
        password: 'defaultPassword123!'
      };
    }

    const operation: Observable<User> = this.isEditMode && this.userId !== null
      ? this.userService.updateUser(this.userId, payload as UpdateUserDto)
      : this.userService.createUser(payload as CreateUserDto);

    this.subscriptions.add(
      operation.subscribe({
        next: (user: User) => {
          this.snackBar.open(`User ${this.isEditMode ? 'updated' : 'created'} successfully!`, 'Close', {
            duration: 3000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
            panelClass: ['snackbar-success'],
          });
          this.router.navigate(['/user']);
        },
        error: (error: any) => {
          console.error(`Error ${this.isEditMode ? 'updating' : 'creating'} user:`, error);
          this.snackBar.open(`Failed: ${error?.message || 'Unknown error'}`, 'Close', {
            duration: 3000,
            panelClass: ['snackbar-error'],
          });
          this.loading = false;
        }
      })
    );
  }

  hasError(controlName: string, errorType: string): boolean | undefined {
    const control = this.userForm.get(controlName);
    return control?.hasError(errorType) && (control?.touched || control?.dirty);
  }

  cancel(): void {
    this.router.navigate(['/user']);
  }
}

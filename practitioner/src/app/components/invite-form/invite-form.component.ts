import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ButtonComponent } from '../ui/button/button.component';
import {
  ButtonSize,
  ButtonVariant,
  ButtonType,
} from '../../constants/button.enums';
import { ViewEncapsulation } from '@angular/core';
import { InviteFormData } from '../../dtos/invites';
import { GroupService } from '../../services/group.service';
import { UserService } from '../../services/user.service';
import { Group } from '../../models/user.model';

export interface CreatePatientConsultationFormData {
  firstName: string;
  lastName: string;
  gender: string;
  language: string;
  group?: string;
  contact: string;
  scheduledDate?: Date;
  specialityId?: number;
  symptoms?: string;
  manualSend?: boolean;
  planLater?: boolean;
  timezone?: string;
  guests?: {
    lovedOne?: boolean;
    colleague?: boolean;
  };
}

@Component({
  selector: 'app-invite-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent],
  templateUrl: './invite-form.component.html',
  styleUrls: ['./invite-form.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class InviteFormComponent implements OnInit, OnDestroy {
  @Input() type: 'remote' = 'remote';
  @Input() editData: InviteFormData | null = null;
  @Input() practitionerId!: number;
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<CreatePatientConsultationFormData>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;

  form!: FormGroup;
  genders = ['Male', 'Female', 'Other'];
  languages = ['English', 'French', 'German'];
  groups: Group[] = [];
  loading = false;
  timezones: string[] = [];
  timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'
  ];
  guestOptions = [
    { key: 'lovedOne', label: 'Invite a loved one or another caregiver' },
    { key: 'colleague', label: 'Invite a colleague' },
  ];

  get isPlanLaterSelected(): boolean {
    return this.form?.get('planLater')?.value || false;
  }

  get isEditMode(): boolean {
    return this.editData !== null;
  }

  get modalTitle(): string {
    return this.isEditMode ? 'EDIT PATIENT' : 'CREATE PATIENT & CONSULTATION';
  }

  get submitButtonText(): string {
    return this.isEditMode ? 'Update' : 'Create';
  }

  constructor(
    private fb: FormBuilder,
    private groupService: GroupService,
    private userService: UserService
  ) { }

  ngOnInit(): void {
    document.body.classList.add('modal-open');
    this.form = this.buildForm();
    this.loadGroups();
    this.setupPlanLaterValidation();

    // Dynamically fetch all IANA timezones (if supported)
    if (typeof Intl.supportedValuesOf === 'function') {
      this.timezones = Intl.supportedValuesOf('timeZone');
    } else {
      // Fallback: use browser-detected timezone only
      this.timezones = [Intl.DateTimeFormat().resolvedOptions().timeZone];
    }

    // Watch for planLater changes to add/remove validation
    this.form.get('planLater')?.valueChanges.subscribe(planLater => {
      const scheduledDateControl = this.form.get('scheduledDate');
      const scheduledTimeControl = this.form.get('scheduledTime');
      const timezoneControl = this.form.get('timezone');

      if (planLater) {
        scheduledDateControl?.setValidators([Validators.required]);
        scheduledTimeControl?.setValidators([Validators.required]);
        timezoneControl?.setValidators([Validators.required]);
      } else {
        scheduledDateControl?.clearValidators();
        scheduledTimeControl?.clearValidators();
        timezoneControl?.clearValidators();
      }

      scheduledDateControl?.updateValueAndValidity();
      scheduledTimeControl?.updateValueAndValidity();
      timezoneControl?.updateValueAndValidity();
    });

    if (this.editData) {
      this.populateFormForEdit();
    }
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      gender: ['', Validators.required],
      language: ['', Validators.required],
      group: [''],
      contact: ['', Validators.required],
      manualSend: [false],
      planLater: [false],
      scheduledDate: [''],
      scheduledTime: [''],
      timezone: ['Asia/Kolkata'],
      symptoms: [''],
      guests: this.fb.group({
        lovedOne: [false],
        colleague: [false],
      }),
    });
  }


  private populateFormForEdit(): void {
    if (!this.editData) return;

    this.form.patchValue({
      firstName: this.editData.firstName,
      lastName: this.editData.lastName,
      gender: this.editData.gender,
      language: this.editData.language,
      group: this.editData.group || '',
      contact: this.editData.contact,
    });
  }

  private loadGroups(): void {
    this.loading = true;
    // Always fetch fresh user info for groups
    this.userService.getCurrentUser(true).subscribe({
      next: (user) => {
        if (user.organizations && user.organizations.length > 0) {
          const organizationId = user.organizations[0].id;
          this.groupService.getGroupsByOrganization(organizationId).subscribe({
            next: (groups) => {
              this.groups = groups;
              this.loading = false;
            },
            error: (error) => {
              console.error('Error loading groups:', error);
              this.groups = [];
              this.loading = false;
            }
          });
        } else {
          console.warn('User has no organizations');
          this.groups = [];
          this.loading = false;
        }
      },
      error: (error) => {
        console.error('Error loading user data:', error);
        this.groups = [];
        this.loading = false;
      }
    });

    // Auto-detect user's timezone and set as default in form
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (this.form && this.form.get('timezone')) {
      this.form.get('timezone')?.setValue(detectedTz);
    }
  }

  private setupPlanLaterValidation(): void {
    this.form.get('planLater')?.valueChanges.subscribe((planLater: boolean) => {
      const plannedDateControl = this.form.get('plannedDate');
      const timezoneControl = this.form.get('timezone');
      const plannedTimeControl = this.form.get('plannedTime');

      if (planLater) {
        plannedDateControl?.setValidators([Validators.required]);
        timezoneControl?.setValidators([Validators.required]);
        plannedTimeControl?.setValidators([Validators.required]);
      } else {
        plannedDateControl?.clearValidators();
        timezoneControl?.clearValidators();
        plannedTimeControl?.clearValidators();
        plannedDateControl?.setValue('');
        timezoneControl?.setValue('');
        plannedTimeControl?.setValue('');
      }

      plannedDateControl?.updateValueAndValidity();
      timezoneControl?.updateValueAndValidity();
      plannedTimeControl?.updateValueAndValidity();
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
  }

  onCancel(): void {
    document.body.classList.remove('modal-open');
    this.close.emit();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.form.controls).forEach(key => {
        this.form.get(key)?.markAsTouched();
      });
      return;
    }

    document.body.classList.remove('modal-open');

    // Combine date and time if both are provided
    let scheduledDateTime: Date | undefined;
    if (this.form.value.planLater && this.form.value.scheduledDate && this.form.value.scheduledTime) {
      const dateStr = this.form.value.scheduledDate;
      const timeStr = this.form.value.scheduledTime;
      scheduledDateTime = new Date(`${dateStr}T${timeStr}`);
    }

    const { manualSend, guests, scheduledTime, ...rest } = this.form.value;
    const payload: CreatePatientConsultationFormData = {
      ...rest,
      scheduledDate: scheduledDateTime,
    };

    this.submit.emit(payload);
  }
}

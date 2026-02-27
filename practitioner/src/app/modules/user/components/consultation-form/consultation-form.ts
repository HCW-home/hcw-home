import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, takeUntil, debounceTime, distinctUntilChanged, map } from 'rxjs';

import { ConsultationService } from '../../../../core/services/consultation.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { ValidationService } from '../../../../core/services/validation.service';
import {
  Appointment,
  AppointmentType,
  AppointmentStatus,
  Consultation,
  CreateConsultationRequest,
  CreateAppointmentRequest,
  CustomField,
  ITemporaryParticipant,
  Queue,
} from '../../../../core/models/consultation';

interface IAppointmentFormValue {
  id: number | null;
  date: string;
  time: string;
  type: AppointmentType;
  dont_invite_beneficiary: boolean;
  dont_invite_practitioner: boolean;
  dont_invite_me: boolean;
  participants: IParticipantFormValue[];
}

interface IParticipantFormValue {
  id: number | null;
  user_id: number | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  timezone: string;
  communication_method: string;
  preferred_language: string;
  is_existing_user: boolean;
  contact_type: 'email' | 'phone';
}

import { Page } from '../../../../core/components/page/page';
import { Loader } from '../../../../shared/components/loader/loader';
import { UserSearchSelect } from '../../../../shared/components/user-search-select/user-search-select';
import { ParticipantItem } from '../../../../shared/components/participant-item/participant-item';
import { IUser } from '../../models/user';
import { UserService } from '../../../../core/services/user.service';
import { CommunicationMethodEnum } from '../../constants/user';
import { Stepper } from '../../../../shared/components/stepper/stepper';
import { IStep } from '../../../../shared/components/stepper/stepper-models';
import { Checkbox } from '../../../../shared/ui-components/checkbox/checkbox';
import { Switch } from '../../../../shared/ui-components/switch/switch';

import { Typography } from '../../../../shared/ui-components/typography/typography';
import { Select, AsyncSearchFn, AsyncSearchResult } from '../../../../shared/ui-components/select/select';
import { Svg } from '../../../../shared/ui-components/svg/svg';
import { Input } from '../../../../shared/ui-components/input/input';
import { Textarea } from '../../../../shared/ui-components/textarea/textarea';
import { Button } from '../../../../shared/ui-components/button/button';

import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { ButtonStateEnum } from '../../../../shared/constants/button';
import {
  ButtonSizeEnum,
  ButtonStyleEnum,
} from '../../../../shared/constants/button';
import { SelectOption } from '../../../../shared/models/select';
import { IBreadcrumb } from '../../../../shared/models/breadcrumb';
import { RoutePaths } from '../../../../core/constants/routes';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { TIMEZONE_OPTIONS } from '../../../../shared/constants/timezone';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-consultation-form',
  templateUrl: './consultation-form.html',
  styleUrl: './consultation-form.scss',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    Page,
    Loader,
    UserSearchSelect,
    ParticipantItem,
    Stepper,
    Typography,
    Select,
    Svg,
    Input,
    Textarea,
    Button,
    Checkbox,
    Switch,
    FormsModule,
    TranslatePipe,
  ],
})
export class ConsultationForm implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  mode: 'create' | 'edit' = 'create';
  consultationId?: number;

  consultation = signal<Consultation | null>(null);
  queues = signal<Queue[]>([]);
  customFields = signal<CustomField[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  isAutoSaving = signal(false);
  lastSaved = signal<Date | null>(null);
  currentStep = signal(0);
  formReady = signal(false);
  savingAppointments = signal<Set<number>>(new Set());

  get stepItems(): IStep[] {
    return [
      { id: 'details', title: this.t.instant('consultationForm.stepDetails') },
      { id: 'owner', title: this.t.instant('consultationForm.stepAssignment'), isOptional: true },
      { id: 'schedule', title: this.t.instant('consultationForm.stepSchedule'), isOptional: true },
    ];
  }

  selectedOwner = signal<IUser | null>(null);
  selectedBeneficiary = signal<IUser | null>(null);
  currentUser = signal<IUser | null>(null);
  private practitionerCache = new Map<number, IUser>();
  private beneficiaryCache = new Map<number, IUser>();

  consultationForm!: FormGroup;

  get appointmentTypeOptions(): SelectOption[] {
    return [
      { value: AppointmentType.ONLINE, label: this.t.instant('consultationForm.online') },
      { value: AppointmentType.INPERSON, label: this.t.instant('consultationForm.inPerson') },
    ];
  }

  timezoneOptions: SelectOption[] = TIMEZONE_OPTIONS;

  get communicationMethods(): SelectOption[] {
    return [
      { value: 'email', label: this.t.instant('consultationForm.email') },
      { value: 'sms', label: this.t.instant('consultationForm.sms') },
      { value: 'whatsapp', label: this.t.instant('consultationForm.whatsApp') },
      { value: 'push', label: this.t.instant('consultationForm.pushNotification') },
    ];
  }

  get languageOptions(): SelectOption[] {
    return [
      { value: 'en', label: this.t.instant('consultationForm.english') },
      { value: 'fr', label: this.t.instant('consultationForm.french') },
      { value: 'es', label: this.t.instant('consultationForm.spanish') },
      { value: 'de', label: this.t.instant('consultationForm.german') },
    ];
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly ButtonStateEnum = ButtonStateEnum;
  protected readonly AppointmentType = AppointmentType;

  breadcrumbs = computed<IBreadcrumb[]>(() => [
    { label: this.t.instant('consultations.tabActive'), link: '/user/consultations' },
    {
      label: this.mode === 'create' ? this.t.instant('consultationForm.createConsultation') : this.t.instant('consultationForm.saveChanges'),
    },
  ]);

  queueOptions = computed<SelectOption[]>(() =>
    this.queues().map(queue => ({
      value: queue.id.toString(),
      label: queue.name,
    }))
  );

  practitionerSearchFn: AsyncSearchFn = (query: string, page: number): Observable<AsyncSearchResult> => {
    return this.userService.searchUsers(query, page, 20, false, undefined, true).pipe(
      map(response => {
        const results: SelectOption[] = response.results.map(user => {
          this.practitionerCache.set(user.pk, user);
          const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || user.username || 'User';
          const initials = this.getUserInitials(user);
          return {
            value: user.pk,
            label: name,
            secondaryLabel: user.email,
            image: user.picture || undefined,
            initials,
          };
        });
        return { results, hasMore: response.next !== null };
      })
    );
  };

  beneficiarySearchFn: AsyncSearchFn = (query: string, page: number): Observable<AsyncSearchResult> => {
    return this.userService.searchUsers(query, page, 20, false).pipe(
      map(response => {
        const results: SelectOption[] = response.results.map(user => {
          this.beneficiaryCache.set(user.pk, user);
          const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || user.username || 'User';
          const initials = this.getUserInitials(user);
          return {
            value: user.pk,
            label: name,
            secondaryLabel: user.email,
            image: user.picture || undefined,
            initials,
          };
        });
        return { results, hasMore: response.next !== null };
      })
    );
  };

  private getUserInitials(user: IUser): string {
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return (firstName || lastName || user.email || 'U').charAt(0).toUpperCase();
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private validationService = inject(ValidationService);
  private userService = inject(UserService);
  private t = inject(TranslationService);

  get appointmentsFormArray(): FormArray {
    return this.consultationForm.get('appointments') as FormArray;
  }

  constructor() {
    this.initForm();
  }

  private initForm(): void {
    this.consultationForm = this.fb.group({
      title: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(200),
        ],
      ],
      description: ['', [Validators.maxLength(1000)]],
      group_id: [''],
      beneficiary_id: [''],
      owned_by_id: [''],
      visible_by_patient: [true],
      appointments: this.fb.array([]),
    });
    this.formReady.set(true);
  }

  ngOnInit(): void {
    this.loadQueues();
    this.loadCurrentUser();
    this.loadCustomFields();

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.mode = 'edit';
        this.consultationId = +params['id'];
        this.loadConsultation();
      } else {
        this.mode = 'create';
      }
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      const step = queryParams['step'];
      if (step !== undefined) {
        const stepNum = parseInt(step, 10);
        if (!isNaN(stepNum) && stepNum >= 0 && stepNum <= 2) {
          this.currentStep.set(stepNum);
        }
      }
    });

    this.setupAutoSave();
    this.setupOwnerSync();
  }

  private loadCurrentUser(): void {
    this.userService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUser.set(user);
    });
    if (!this.currentUser()) {
      this.userService.getCurrentUser().pipe(takeUntil(this.destroy$)).subscribe();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadQueues(): void {
    this.consultationService
      .getQueues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: queues => {
          this.queues.set(queues);
        },
        error: (error) => {
          this.toasterService.show('error', this.t.instant('consultationForm.errorLoadingQueues'), getErrorMessage(error));
          this.queues.set([]);
        },
      });
  }

  loadCustomFields(): void {
    this.consultationService
      .getCustomFields('consultations.Consultation')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: fields => {
          this.customFields.set(fields);
          const customFieldsGroup = this.consultationForm.get('custom_fields') as FormGroup;
          if (!customFieldsGroup) {
            const group: Record<string, any> = {};
            fields.forEach(field => {
              group[field.id.toString()] = ['', field.required ? Validators.required : []];
            });
            this.consultationForm.addControl('custom_fields', this.fb.group(group));
          }
        },
      });
  }

  loadConsultation(): void {
    if (!this.consultationId) return;

    this.isLoading.set(true);
    this.consultationService
      .getConsultation(this.consultationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: consultation => {
          this.consultation.set(consultation);
          this.populateForm(consultation);
          this.isLoading.set(false);
          this.loadAppointments();
        },
        error: (error) => {
          this.isLoading.set(false);
          this.toasterService.show('error', this.t.instant('consultationForm.errorLoadingConsultation'), getErrorMessage(error));
          this.router.navigate([
            `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
          ]);
        },
      });
  }

  populateForm(consultation: Consultation): void {
    this.consultationForm.patchValue({
      title: consultation.title || '',
      description: consultation.description || '',
      group_id: consultation.group?.id?.toString() || '',
      beneficiary_id: consultation.beneficiary?.id?.toString() || '',
      visible_by_patient: consultation.visible_by_patient ?? true,
    });

    if (consultation.custom_fields?.length) {
      const cfValues: Record<string, string> = {};
      consultation.custom_fields.forEach(cf => {
        cfValues[cf.field.toString()] = cf.value || '';
      });
      this.consultationForm.get('custom_fields')?.patchValue(cfValues);
    }
  }

  loadAppointments(): void {
    if (!this.consultationId) return;

    this.consultationService
      .getConsultationAppointments(this.consultationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.appointmentsFormArray.clear();
          response.results.forEach((appointment: Appointment) => {
            this.addAppointmentFromData(appointment);
          });
        },
        error: (error) => {
          this.toasterService.show('error', this.t.instant('consultationForm.errorLoadingAppointments'), getErrorMessage(error));
        },
      });
  }

  private addAppointmentFromData(appointment: Appointment): void {
    const scheduledDate = appointment.scheduled_at ? new Date(appointment.scheduled_at) : new Date();
    const date = scheduledDate.toISOString().split('T')[0];
    const time = scheduledDate.toTimeString().slice(0, 5);

    const appointmentGroup = this.fb.group({
      id: [appointment.id],
      date: [date, Validators.required],
      time: [time, Validators.required],
      type: [appointment.type || AppointmentType.ONLINE, Validators.required],
      dont_invite_beneficiary: [false],
      dont_invite_practitioner: [false],
      dont_invite_me: [false],
      participants: this.fb.array([]),
    });

    if (appointment.participants) {
      const participantsArray = appointmentGroup.get('participants') as FormArray;
      appointment.participants.forEach(p => {
        participantsArray.push(this.createParticipantGroup({
          id: p.id,
          user_id: p.user?.id,
          first_name: p.user?.first_name || '',
          last_name: p.user?.last_name || '',
          email: p.user?.email || '',
          phone: p.user?.mobile_phone_number || '',
          timezone: p.user?.timezone || '',
          communication_method: p.user?.communication_method || '',
          preferred_language: p.user?.preferred_language || '',
          is_existing_user: !!p.user,
          contact_type: p.user?.mobile_phone_number ? 'phone' : 'email',
        }));
      });
    }

    this.appointmentsFormArray.push(appointmentGroup);
  }

  private setupAutoSave(): void {
    this.consultationForm.valueChanges
      .pipe(
        debounceTime(800),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        if (this.mode === 'edit' && this.consultationId && !this.isAutoSaving()) {
          this.autoSaveConsultation();
        }
      });
  }

  private autoSaveConsultation(): void {
    if (!this.consultationId || !this.consultationForm.get('title')?.valid) return;

    const formValue = this.consultationForm.value;
    const consultationData: Partial<CreateConsultationRequest> = {
      title: formValue.title,
      description: formValue.description || undefined,
      group_id: formValue.group_id ? parseInt(formValue.group_id) : undefined,
      beneficiary_id: formValue.beneficiary_id ? parseInt(formValue.beneficiary_id) : undefined,
      visible_by_patient: formValue.visible_by_patient,
      custom_fields: this.buildCustomFieldsPayload(),
    };

    this.isAutoSaving.set(true);

    this.consultationService
      .updateConsultation(this.consultationId, consultationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: consultation => {
          this.consultation.set(consultation);
          this.lastSaved.set(new Date());
          this.isAutoSaving.set(false);
        },
        error: () => {
          this.isAutoSaving.set(false);
        },
      });
  }

  onSubmit(): void {
    const titleControl = this.consultationForm.get('title');
    if (titleControl?.valid) {
      this.isSaving.set(true);

      if (this.mode === 'create') {
        this.createConsultation();
      } else {
        this.updateConsultation();
      }
    } else {
      this.validationService.validateAllFormFields(this.consultationForm);
      this.toasterService.show(
        'error',
        this.t.instant('consultationForm.validationError'),
        this.t.instant('consultationForm.fillReasonField')
      );
    }
  }

  createConsultation(): void {
    const formValue = this.consultationForm.value;
    const beneficiaryId = typeof formValue.beneficiary_id === 'number'
      ? formValue.beneficiary_id
      : (formValue.beneficiary_id ? parseInt(formValue.beneficiary_id) : undefined);
    const ownedById = typeof formValue.owned_by_id === 'number'
      ? formValue.owned_by_id
      : (formValue.owned_by_id ? parseInt(formValue.owned_by_id) : undefined);
    const consultationData: CreateConsultationRequest = {
      title: formValue.title,
      description: formValue.description || undefined,
      group_id: formValue.group_id ? parseInt(formValue.group_id) : undefined,
      beneficiary_id: beneficiaryId,
      owned_by_id: ownedById,
      visible_by_patient: formValue.visible_by_patient,
      custom_fields: this.buildCustomFieldsPayload(),
    };

    this.consultationService
      .createConsultation(consultationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: consultation => {
          if (this.appointmentsFormArray.length > 0) {
            this.createAppointmentsForConsultation(consultation.id);
          } else {
            this.toasterService.show(
              'success',
              this.t.instant('consultationForm.consultationCreated'),
              this.t.instant('consultationForm.consultationCreatedMessage')
            );
            this.isSaving.set(false);
            this.router.navigate([
              `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
              consultation.id,
            ]);
          }
        },
        error: (error) => {
          this.isSaving.set(false);
          this.toasterService.show('error', this.t.instant('consultationForm.errorCreating'), getErrorMessage(error));
        },
      });
  }

  private createAppointmentsForConsultation(consultationId: number): void {
    const appointments = this.appointmentsFormArray.value as IAppointmentFormValue[];
    let completed = 0;

    appointments.forEach((apt: IAppointmentFormValue) => {
      const scheduledAt = this.combineDateTime(apt.date, apt.time);
      const { participants_ids, temporary_participants } = this.mapParticipantsForRequest(apt.participants);

      const appointmentData: CreateAppointmentRequest = {
        scheduled_at: scheduledAt,
        type: apt.type,
        dont_invite_beneficiary: apt.dont_invite_beneficiary,
        dont_invite_practitioner: apt.dont_invite_practitioner,
        dont_invite_me: apt.dont_invite_me,
        participants_ids,
        temporary_participants,
      };

      this.consultationService
        .createConsultationAppointment(consultationId, appointmentData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            completed++;
            if (completed === appointments.length) {
              this.toasterService.show(
                'success',
                'Consultation Created',
                'Consultation created successfully'
              );
              this.isSaving.set(false);
              this.router.navigate([
                `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
                consultationId,
              ]);
            }
          },
          error: (error: HttpErrorResponse) => {
            this.toasterService.show('error', this.t.instant('consultationForm.errorCreatingAppointment'), getErrorMessage(error));
            completed++;
            if (completed === appointments.length) {
              this.isSaving.set(false);
              this.router.navigate([
                `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
                consultationId,
              ]);
            }
          },
        });
    });
  }

  updateConsultation(): void {
    if (!this.consultationId) return;

    const formValue = this.consultationForm.value;
    const consultationData: Partial<CreateConsultationRequest> = {
      title: formValue.title,
      description: formValue.description || undefined,
      group_id: formValue.group_id ? parseInt(formValue.group_id) : undefined,
      beneficiary_id: formValue.beneficiary_id
        ? parseInt(formValue.beneficiary_id)
        : undefined,
      visible_by_patient: formValue.visible_by_patient,
      custom_fields: this.buildCustomFieldsPayload(),
    };

    this.consultationService
      .updateConsultation(this.consultationId, consultationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: consultation => {
          this.consultation.set(consultation);
          this.toasterService.show(
            'success',
            this.t.instant('consultationForm.consultationUpdated'),
            this.t.instant('consultationForm.consultationUpdatedMessage')
          );
          this.isSaving.set(false);
          this.router.navigate([
            `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
            consultation.id,
          ]);
        },
        error: (error) => {
          this.isSaving.set(false);
          this.toasterService.show('error', this.t.instant('consultationForm.errorUpdating'), getErrorMessage(error));
        },
      });
  }

  cancel(): void {
    if (this.mode === 'edit' && this.consultationId) {
      this.router.navigate([
        `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
        this.consultationId,
      ]);
    } else {
      this.router.navigate([`/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`]);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.consultationForm.get(fieldName);
    return (field?.invalid && field?.touched) || false;
  }

  getFieldError(fieldName: string): string {
    const field = this.consultationForm.get(fieldName);
    if (field?.errors && field?.touched) {
      if (field.errors['required']) return this.t.instant('consultationForm.fieldRequired', { field: fieldName });
      if (field.errors['minlength']) return this.t.instant('consultationForm.fieldTooShort', { field: fieldName });
      if (field.errors['maxlength']) return this.t.instant('consultationForm.fieldTooLong', { field: fieldName });
      if (field.errors['email']) return this.t.instant('consultationForm.invalidEmail');
    }
    return '';
  }

  onOwnerSelected(user: IUser | null): void {
    this.selectedOwner.set(user);
    if (user) {
      this.consultationForm.patchValue({ owned_by_id: user.pk });
    } else {
      this.consultationForm.patchValue({ owned_by_id: '' });
    }
    this.updateInviteCheckboxStates();
  }

  private setupOwnerSync(): void {
    this.consultationForm.get('owned_by_id')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (value) {
          const user = this.practitionerCache.get(Number(value));
          this.selectedOwner.set(user || null);
        } else {
          this.selectedOwner.set(null);
        }
        this.updateInviteCheckboxStates();
      });

    this.consultationForm.get('beneficiary_id')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (value) {
          const user = this.beneficiaryCache.get(Number(value));
          this.selectedBeneficiary.set(user || null);
        } else {
          this.selectedBeneficiary.set(null);
        }
        this.updateInviteCheckboxStates();
      });
  }

  nextStep(): void {
    if (this.canProceedToNextStep() && this.currentStep() < 2) {
      const newStep = this.currentStep() + 1;
      this.currentStep.set(newStep);
      this.updateStepInUrl(newStep);
    }
  }

  previousStep(): void {
    if (this.currentStep() > 0) {
      const newStep = this.currentStep() - 1;
      this.currentStep.set(newStep);
      this.updateStepInUrl(newStep);
    }
  }

  goToStep(step: number): void {
    if (step >= 0 && step <= 2) {
      this.currentStep.set(step);
      this.updateStepInUrl(step);
    }
  }

  private updateStepInUrl(step: number): void {
    this.router.navigate([], {
      queryParams: { step },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  canProceedToNextStep(): boolean {
    return this.isStepValid(this.currentStep());
  }

  isStepValid(step: number): boolean {
    switch (step) {
      case 0:
        const titleControl = this.consultationForm.get('title');
        return titleControl?.valid ?? false;
      case 1:
        return true;
      case 2:
        return true;
      default:
        return true;
    }
  }

  addAppointment(): void {
    const appointmentGroup = this.fb.group({
      id: [null],
      date: ['', Validators.required],
      time: ['', Validators.required],
      type: [AppointmentType.ONLINE, Validators.required],
      dont_invite_beneficiary: [{ value: false, disabled: this.isBeneficiaryCheckboxDisabled() }],
      dont_invite_practitioner: [{ value: false, disabled: this.isPractitionerCheckboxDisabled() }],
      dont_invite_me: [false],
      participants: this.fb.array([]),
    });
    this.appointmentsFormArray.push(appointmentGroup);
  }

  updateInviteCheckboxStates(): void {
    const beneficiaryDisabled = this.isBeneficiaryCheckboxDisabled();
    const practitionerDisabled = this.isPractitionerCheckboxDisabled();

    for (let i = 0; i < this.appointmentsFormArray.length; i++) {
      const appointment = this.appointmentsFormArray.at(i);
      const beneficiaryControl = appointment.get('dont_invite_beneficiary');
      const practitionerControl = appointment.get('dont_invite_practitioner');

      if (beneficiaryDisabled) {
        beneficiaryControl?.disable();
      } else {
        beneficiaryControl?.enable();
      }

      if (practitionerDisabled) {
        practitionerControl?.disable();
      } else {
        practitionerControl?.enable();
      }
    }
  }

  removeAppointment(index: number): void {
    const appointment = this.appointmentsFormArray.at(index);
    const appointmentId = appointment.get('id')?.value;

    if (appointmentId && this.mode === 'edit') {
      this.consultationService
        .deleteAppointment(appointmentId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.appointmentsFormArray.removeAt(index);
            this.toasterService.show('success', this.t.instant('consultationForm.appointmentRemoved'), this.t.instant('consultationForm.appointmentRemovedMessage'));
          },
          error: (error) => {
            this.toasterService.show('error', this.t.instant('consultationForm.errorRemovingAppointment'), getErrorMessage(error));
          },
        });
    } else {
      this.appointmentsFormArray.removeAt(index);
    }
  }

  saveAppointment(index: number): void {
    if (!this.consultationId) return;

    const appointment = this.appointmentsFormArray.at(index);
    const appointmentId = appointment.get('id')?.value;
    const formValue = appointment.value as IAppointmentFormValue;

    const scheduledAt = this.combineDateTime(formValue.date, formValue.time);
    const { participants_ids, temporary_participants } = this.mapParticipantsForRequest(formValue.participants);

    const saving = new Set(this.savingAppointments());
    saving.add(index);
    this.savingAppointments.set(saving);

    if (appointmentId) {
      this.consultationService
        .updateAppointment(appointmentId, {
          scheduled_at: scheduledAt,
          type: formValue.type,
          participants_ids,
          temporary_participants,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            const s = new Set(this.savingAppointments());
            s.delete(index);
            this.savingAppointments.set(s);
            this.toasterService.show('success', this.t.instant('consultationForm.appointmentUpdated'), this.t.instant('consultationForm.appointmentUpdatedMessage'));
          },
          error: (error) => {
            const s = new Set(this.savingAppointments());
            s.delete(index);
            this.savingAppointments.set(s);
            this.toasterService.show('error', this.t.instant('consultationForm.errorUpdatingAppointment'), getErrorMessage(error));
          },
        });
    } else {
      const appointmentData: CreateAppointmentRequest = {
        scheduled_at: scheduledAt,
        type: formValue.type,
        dont_invite_beneficiary: formValue.dont_invite_beneficiary,
        dont_invite_practitioner: formValue.dont_invite_practitioner,
        dont_invite_me: formValue.dont_invite_me,
        participants_ids,
        temporary_participants,
      };

      this.consultationService
        .createConsultationAppointment(this.consultationId, appointmentData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (created: Appointment) => {
            appointment.patchValue({ id: created.id });
            const s = new Set(this.savingAppointments());
            s.delete(index);
            this.savingAppointments.set(s);
            this.toasterService.show('success', this.t.instant('consultationForm.appointmentCreated'), this.t.instant('consultationForm.appointmentCreatedMessage'));
          },
          error: (error: HttpErrorResponse) => {
            const s = new Set(this.savingAppointments());
            s.delete(index);
            this.savingAppointments.set(s);
            this.toasterService.show('error', this.t.instant('consultationForm.errorCreatingAppointment'), getErrorMessage(error));
          },
        });
    }
  }

  isAppointmentSaving(index: number): boolean {
    return this.savingAppointments().has(index);
  }

  hasAppointmentId(index: number): boolean {
    const appointment = this.appointmentsFormArray.at(index);
    return !!appointment?.get('id')?.value;
  }

  isAppointmentFieldInvalid(appointmentIndex: number, fieldName: string): boolean {
    const appointment = this.appointmentsFormArray.at(appointmentIndex);
    const field = appointment?.get(fieldName);
    return (field?.invalid && field?.touched) || false;
  }

  getParticipantsFormArray(appointmentIndex: number): FormArray {
    const appointment = this.appointmentsFormArray.at(appointmentIndex);
    return appointment.get('participants') as FormArray;
  }

  addParticipantToAppointment(appointmentIndex: number): void {
    const participantsArray = this.getParticipantsFormArray(appointmentIndex);
    participantsArray.push(this.createParticipantGroup());
  }

  removeParticipantFromAppointment(appointmentIndex: number, participantIndex: number): void {
    const participantsArray = this.getParticipantsFormArray(appointmentIndex);
    participantsArray.removeAt(participantIndex);
  }

  private createParticipantGroup(data?: Record<string, unknown>): FormGroup {
    return this.fb.group({
      id: [data?.['id'] || null],
      user_id: [data?.['user_id'] || null],
      first_name: [data?.['first_name'] || ''],
      last_name: [data?.['last_name'] || ''],
      email: [data?.['email'] || ''],
      phone: [data?.['phone'] || ''],
      timezone: [data?.['timezone'] || ''],
      communication_method: [data?.['communication_method'] || ''],
      preferred_language: [data?.['preferred_language'] || ''],
      is_existing_user: [data?.['is_existing_user'] !== undefined ? data['is_existing_user'] : true],
      contact_type: [data?.['contact_type'] || 'email'],
    });
  }

  isParticipantExistingUser(appointmentIndex: number, participantIndex: number): boolean {
    const participant = this.getParticipantsFormArray(appointmentIndex).at(participantIndex);
    return participant?.get('is_existing_user')?.value || false;
  }

  setParticipantType(appointmentIndex: number, participantIndex: number, isExistingUser: boolean): void {
    const participant = this.getParticipantsFormArray(appointmentIndex).at(participantIndex);
    participant.patchValue({ is_existing_user: isExistingUser });
    if (isExistingUser) {
      participant.patchValue({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
      });
    } else {
      participant.patchValue({ user_id: null });
    }
  }

  getParticipantContactType(appointmentIndex: number, participantIndex: number): string {
    const participant = this.getParticipantsFormArray(appointmentIndex).at(participantIndex);
    return participant?.get('contact_type')?.value || 'email';
  }

  setParticipantContactType(appointmentIndex: number, participantIndex: number, contactType: string): void {
    const participant = this.getParticipantsFormArray(appointmentIndex).at(participantIndex);
    participant.patchValue({ contact_type: contactType, email: '', phone: '' });
  }

  onParticipantUserSelected(appointmentIndex: number, participantIndex: number, user: IUser | null): void {
    const participant = this.getParticipantsFormArray(appointmentIndex).at(participantIndex);
    if (user) {
      participant.patchValue({
        user_id: user.pk,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      });
    } else {
      participant.patchValue({
        user_id: null,
        first_name: '',
        last_name: '',
        email: '',
      });
    }
  }

  setAppointmentType(appointmentIndex: number, type: AppointmentType): void {
    const appointment = this.appointmentsFormArray.at(appointmentIndex);
    appointment.patchValue({ type });
  }

  getAppointmentType(appointmentIndex: number): AppointmentType {
    const appointment = this.appointmentsFormArray.at(appointmentIndex);
    return appointment?.get('type')?.value || AppointmentType.ONLINE;
  }

  getAppointmentControl(appointmentIndex: number, controlName: string): { value: boolean } {
    const appointment = this.appointmentsFormArray.at(appointmentIndex);
    return appointment?.get(controlName) || { value: false };
  }

  toggleInvite(appointmentIndex: number, controlName: string, invited: boolean): void {
    const appointment = this.appointmentsFormArray.at(appointmentIndex);
    appointment?.get(controlName)?.setValue(!invited);
  }

  getBeneficiaryUser(): IUser | null {
    const beneficiary = this.selectedBeneficiary();
    if (beneficiary) {
      return beneficiary;
    }
    const consultation = this.consultation();
    if (consultation?.beneficiary) {
      return {
        pk: consultation.beneficiary.id,
        email: consultation.beneficiary.email,
        first_name: consultation.beneficiary.first_name,
        last_name: consultation.beneficiary.last_name,
        is_active: true,
        is_staff: false,
        is_superuser: false,
        date_joined: '',
        communication_method: CommunicationMethodEnum.EMAIL,
        timezone: consultation.beneficiary.timezone || '',
      };
    }
    return null;
  }

  getOwnerUser(): IUser | null {
    const owner = this.selectedOwner();
    if (owner) {
      return owner;
    }
    const consultation = this.consultation();
    if (consultation?.owned_by) {
      return {
        pk: consultation.owned_by.id,
        email: consultation.owned_by.email,
        first_name: consultation.owned_by.first_name,
        last_name: consultation.owned_by.last_name,
        is_active: true,
        is_staff: false,
        is_superuser: false,
        date_joined: '',
        communication_method: CommunicationMethodEnum.EMAIL,
        timezone: consultation.owned_by.timezone || '',
      };
    }
    return null;
  }

  getCurrentUserForInvite(): IUser | null {
    return this.currentUser();
  }

  isBeneficiaryCheckboxDisabled(): boolean {
    return !this.getBeneficiaryUser();
  }

  isPractitionerCheckboxDisabled(): boolean {
    return !this.getOwnerUser();
  }

  onBeneficiarySelected(user: IUser | null): void {
    this.selectedBeneficiary.set(user);
    if (user) {
      this.consultationForm.patchValue({ beneficiary_id: user.pk });
    } else {
      this.consultationForm.patchValue({ beneficiary_id: '' });
    }
    this.updateInviteCheckboxStates();
  }

  private mapParticipantsForRequest(participants: IParticipantFormValue[]): {
    participants_ids: number[];
    temporary_participants: ITemporaryParticipant[];
  } {
    const participants_ids: number[] = [];
    const temporary_participants: ITemporaryParticipant[] = [];

    if (!participants || participants.length === 0) {
      return { participants_ids, temporary_participants };
    }

    for (const p of participants) {
      if (p.is_existing_user && p.user_id) {
        participants_ids.push(p.user_id);
      } else {
        const tempParticipant: ITemporaryParticipant = {};

        if (p.first_name) {
          tempParticipant.first_name = p.first_name;
        }
        if (p.last_name) {
          tempParticipant.last_name = p.last_name;
        }
        if (p.contact_type === 'email' && p.email) {
          tempParticipant.email = p.email;
        } else if (p.contact_type === 'phone' && p.phone) {
          tempParticipant.mobile_phone_number = p.phone;
        }
        if (p.timezone) {
          tempParticipant.timezone = p.timezone;
        }
        if (p.communication_method) {
          tempParticipant.communication_method = p.communication_method;
        }
        if (p.preferred_language) {
          tempParticipant.preferred_language = p.preferred_language;
        }

        temporary_participants.push(tempParticipant);
      }
    }

    return { participants_ids, temporary_participants };
  }

  getCustomFieldOptions(field: CustomField): SelectOption[] {
    return (field.options || []).map(o => ({ value: o, label: o }));
  }

  private buildCustomFieldsPayload(): { field: number; value: string | null }[] {
    const cfGroup = this.consultationForm.get('custom_fields');
    if (!cfGroup) return [];
    const values = cfGroup.value;
    return Object.entries(values)
      .filter(([_, value]) => value !== '' && value !== null && value !== undefined)
      .map(([fieldId, value]) => ({
        field: parseInt(fieldId, 10),
        value: value as string | null,
      }));
  }

  private combineDateTime(date: string, time: string): string {
    return `${date}T${time}:00`;
  }
}

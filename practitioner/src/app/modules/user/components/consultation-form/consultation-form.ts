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
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, Subject, takeUntil, debounceTime, distinctUntilChanged, map } from 'rxjs';

import { ConsultationService } from '../../../../core/services/consultation.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { ValidationService } from '../../../../core/services/validation.service';
import {
  Appointment,
  AppointmentType,
  Consultation,
  CreateConsultationRequest,
  CreateAppointmentRequest,
  CustomField,
  Queue,
} from '../../../../core/models/consultation';

import { Page } from '../../../../core/components/page/page';
import { Loader } from '../../../../shared/components/loader/loader';
import { IUser } from '../../models/user';
import { UserService } from '../../../../core/services/user.service';
import { CommunicationMethodEnum } from '../../constants/user';
import { Stepper } from '../../../../shared/components/stepper/stepper';
import { IStep } from '../../../../shared/components/stepper/stepper-models';
import { Checkbox } from '../../../../shared/ui-components/checkbox/checkbox';
import { AppointmentFormModal } from '../consultation-detail/appointment-form-modal/appointment-form-modal';
import { ParticipantItem } from '../../../../shared/components/participant-item/participant-item';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { AddEditPatient } from '../add-edit-patient/add-edit-patient';

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
import { BadgeTypeEnum } from '../../../../shared/constants/badge';
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
    Stepper,
    Typography,
    Select,
    Svg,
    Input,
    Textarea,
    Button,
    Checkbox,
    FormsModule,
    TranslatePipe,
    AppointmentFormModal,
    ParticipantItem,
    ModalComponent,
    AddEditPatient,
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

  beneficiaryInitialOption = computed<SelectOption | null>(() => {
    const beneficiary = this.selectedBeneficiary();
    if (!beneficiary) return null;
    const currentUser = this.currentUser();
    const isCurrentUser = !!(currentUser && beneficiary.pk === currentUser.pk);
    const name = isCurrentUser
      ? this.t.instant('userSearchSelect.me')
      : `${beneficiary.first_name || ''} ${beneficiary.last_name || ''}`.trim() || beneficiary.email || beneficiary.username || 'User';
    const initials = this.getUserInitials(beneficiary);
    return {
      value: beneficiary.pk,
      label: name,
      secondaryLabel: beneficiary.email,
      image: beneficiary.picture || undefined,
      initials,
      isCurrentUser,
      isPractitioner: beneficiary.is_practitioner,
    };
  });

  // Modal state
  isAppointmentModalOpen = signal(false);
  editingAppointment = signal<Appointment | null>(null);
  appointments = signal<Appointment[]>([]);
  pendingAppointmentRequests = signal<CreateAppointmentRequest[]>([]);
  isAddPatientModalOpen = signal(false);
  newPatientInitialName = signal<string>('');

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
  protected readonly BadgeTypeEnum = BadgeTypeEnum;

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
        const currentUser = this.currentUser();
        const results: SelectOption[] = response.results.map(user => {
          this.practitionerCache.set(user.pk, user);
          const isCurrentUser = !!(currentUser && user.pk === currentUser.pk);
          const name = isCurrentUser
            ? this.t.instant('userSearchSelect.me')
            : `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || user.username || 'User';
          const initials = this.getUserInitials(user);
          return {
            value: user.pk,
            label: name,
            secondaryLabel: user.email,
            image: user.picture || undefined,
            initials,
            isCurrentUser,
            isPractitioner: user.is_practitioner,
          };
        });
        return { results, hasMore: response.next !== null };
      })
    );
  };

  beneficiarySearchFn: AsyncSearchFn = (query: string, page: number): Observable<AsyncSearchResult> => {
    return this.userService.searchUsers(query, page, 20, false).pipe(
      map(response => {
        const currentUser = this.currentUser();
        const results: SelectOption[] = response.results.map(user => {
          this.beneficiaryCache.set(user.pk, user);
          const isCurrentUser = !!(currentUser && user.pk === currentUser.pk);
          const name = isCurrentUser
            ? this.t.instant('userSearchSelect.me')
            : `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || user.username || 'User';
          const initials = this.getUserInitials(user);
          return {
            value: user.pk,
            label: name,
            secondaryLabel: user.email,
            image: user.picture || undefined,
            initials,
            isCurrentUser,
            isPractitioner: user.is_practitioner,
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

  constructor() {
    this.initForm();
  }

  openAppointmentModal(appointment?: Appointment): void {
    this.editingAppointment.set(appointment || null);
    this.isAppointmentModalOpen.set(true);
  }

  closeAppointmentModal(): void {
    this.isAppointmentModalOpen.set(false);
    this.editingAppointment.set(null);
  }

  onAppointmentCreated(appointment: Appointment): void {
    this.appointments.update(list => [...list, appointment]);
    this.closeAppointmentModal();
  }

  onAppointmentUpdated(appointment: Appointment): void {
    this.appointments.update(list =>
      list.map(a => a.id === appointment.id ? appointment : a)
    );
    this.closeAppointmentModal();
  }

  onAppointmentDataReady(data: CreateAppointmentRequest): void {
    this.pendingAppointmentRequests.update(list => [...list, data]);
    this.closeAppointmentModal();
  }

  deleteAppointment(appointment: Appointment): void {
    if (!appointment.id) return;

    this.consultationService
      .deleteAppointment(appointment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.appointments.update(list => list.filter(a => a.id !== appointment.id));
          this.toasterService.show('success', this.t.instant('consultationForm.appointmentRemoved'), this.t.instant('consultationForm.appointmentRemovedMessage'));
        },
        error: (error) => {
          this.toasterService.show('error', this.t.instant('consultationForm.errorRemovingAppointment'), getErrorMessage(error));
        },
      });
  }

  removePendingAppointment(index: number): void {
    this.pendingAppointmentRequests.update(list => list.filter((_, i) => i !== index));
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
          if (queues.length === 0) {
            this.consultationForm.get('group_id')?.disable();
          }
        },
        error: (error) => {
          this.toasterService.show('error', this.t.instant('consultationForm.errorLoadingQueues'), getErrorMessage(error));
          this.queues.set([]);
          this.consultationForm.get('group_id')?.disable();
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
          this.appointments.set(response.results);
        },
        error: (error) => {
          this.toasterService.show('error', this.t.instant('consultationForm.errorLoadingAppointments'), getErrorMessage(error));
        },
      });
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
    if (!titleControl?.valid) {
      this.validationService.validateAllFormFields(this.consultationForm);
      this.toasterService.show(
        'error',
        this.t.instant('consultationForm.validationError'),
        this.t.instant('consultationForm.fillReasonField')
      );
      return;
    }

    this.isSaving.set(true);

    if (this.mode === 'create') {
      this.createConsultation();
    } else {
      this.updateConsultation();
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
          // Si des appointments en attente, on les crée avec le consultationId
          if (this.pendingAppointmentRequests().length > 0) {
            this.createPendingAppointments(consultation.id);
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

  private createPendingAppointments(consultationId: number): void {
    const pendingRequests = this.pendingAppointmentRequests();
    let completed = 0;
    let errors = 0;

    pendingRequests.forEach(appointmentData => {
      this.consultationService
        .createConsultationAppointment(consultationId, appointmentData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            completed++;
            if (completed + errors === pendingRequests.length) {
              this.isSaving.set(false);
              this.toasterService.show(
                'success',
                this.t.instant('consultationForm.consultationCreated'),
                this.t.instant('consultationForm.consultationCreatedMessage')
              );
              this.router.navigate([
                `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
                consultationId,
              ]);
            }
          },
          error: () => {
            errors++;
            if (completed + errors === pendingRequests.length) {
              this.isSaving.set(false);
              this.toasterService.show(
                'warning',
                this.t.instant('consultationForm.consultationCreated'),
                this.t.instant('consultationForm.someAppointmentsNotCreated')
              );
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


  onBeneficiarySelected(user: IUser | null): void {
    this.selectedBeneficiary.set(user);
    if (user) {
      this.consultationForm.patchValue({ beneficiary_id: user.pk });
    } else {
      this.consultationForm.patchValue({ beneficiary_id: '' });
    }
  }

  openAddPatientModal(searchTerm: string): void {
    this.newPatientInitialName.set(searchTerm);
    this.isAddPatientModalOpen.set(true);
  }

  closeAddPatientModal(): void {
    this.isAddPatientModalOpen.set(false);
    this.newPatientInitialName.set('');
  }

  onPatientCreated(patient: IUser): void {
    // Add to cache
    this.beneficiaryCache.set(patient.pk, patient);
    // Select the newly created patient
    this.selectedBeneficiary.set(patient);
    this.consultationForm.patchValue({ beneficiary_id: patient.pk });
    // Close modal
    this.closeAddPatientModal();
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

  getPendingAppointmentParticipants(appointmentRequest: CreateAppointmentRequest): any[] {
    const participants: any[] = [];

    // Add beneficiary if not excluded
    if (!appointmentRequest.dont_invite_beneficiary && this.getBeneficiaryUser()) {
      const beneficiary = this.getBeneficiaryUser()!;
      participants.push({
        user_id: beneficiary.pk,
        first_name: beneficiary.first_name,
        last_name: beneficiary.last_name,
        email: beneficiary.email,
      });
    }

    // Add owner/practitioner if not excluded
    if (!appointmentRequest.dont_invite_practitioner && this.getOwnerUser()) {
      const owner = this.getOwnerUser()!;
      participants.push({
        user_id: owner.pk,
        first_name: owner.first_name,
        last_name: owner.last_name,
        email: owner.email,
      });
    }

    // Add current user if not excluded
    if (!appointmentRequest.dont_invite_me && this.getCurrentUserForInvite()) {
      const currentUser = this.getCurrentUserForInvite()!;
      participants.push({
        user_id: currentUser.pk,
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        email: currentUser.email,
      });
    }

    // Add temporary participants
    if (appointmentRequest.temporary_participants) {
      participants.push(...appointmentRequest.temporary_participants);
    }

    return participants;
  }

}

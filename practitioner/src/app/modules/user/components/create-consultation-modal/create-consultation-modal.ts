import {
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { map, Observable, Subject, takeUntil } from 'rxjs';

import { ConsultationService } from '../../../../core/services/consultation.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { ValidationService } from '../../../../core/services/validation.service';
import { UserService } from '../../../../core/services/user.service';
import { TranslationService } from '../../../../core/services/translation.service';
import {
  CreateAppointmentRequest,
  CreateConsultationRequest,
  Queue,
  User,
} from '../../../../core/models/consultation';
import { IUser } from '../../models/user';
import { RoutePaths } from '../../../../core/constants/routes';
import { getErrorMessage } from '../../../../core/utils/error-helper';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { Input } from '../../../../shared/ui-components/input/input';
import { Select, AsyncSearchFn, AsyncSearchResult } from '../../../../shared/ui-components/select/select';
import { Button } from '../../../../shared/ui-components/button/button';
import { Checkbox } from '../../../../shared/ui-components/checkbox/checkbox';
import { AppointmentForm } from '../../../../shared/components/appointment-form/appointment-form';
import { AddEditPatient } from '../add-edit-patient/add-edit-patient';

import { ButtonSizeEnum, ButtonStyleEnum } from '../../../../shared/constants/button';
import { SelectOption } from '../../../../shared/models/select';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-create-consultation-modal',
  templateUrl: './create-consultation-modal.html',
  styleUrl: './create-consultation-modal.scss',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ModalComponent,
    Input,
    Select,
    Button,
    Checkbox,
    AppointmentForm,
    AddEditPatient,
    TranslatePipe,
  ],
})
export class CreateConsultationModal implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private validationService = inject(ValidationService);
  private userService = inject(UserService);
  private t = inject(TranslationService);

  isOpen = input<boolean>(false);
  closed = output<void>();
  consultationCreated = output<number>();

  queues = signal<Queue[]>([]);
  currentUser = signal<IUser | null>(null);
  selectedBeneficiary = signal<IUser | null>(null);
  selectedOwner = signal<IUser | null>(null);
  isSaving = signal(false);
  showSchedule = signal(false);
  showAdvanced = signal(false);
  isAddPatientModalOpen = signal(false);
  newPatientInitialName = signal('');
  pendingAppointmentData = signal<CreateAppointmentRequest | null>(null);
  appointmentFormRef = viewChild<AppointmentForm>('appointmentFormRef');

  private beneficiaryCache = new Map<number, IUser>();
  private practitionerCache = new Map<number, IUser>();

  consultationForm!: FormGroup;

  beneficiaryInitialOption = computed<SelectOption | null>(() => {
    const beneficiary = this.selectedBeneficiary();
    if (!beneficiary) return null;
    const currentUser = this.currentUser();
    const isCurrentUser = !!(currentUser && beneficiary.pk === currentUser.pk);
    const name = isCurrentUser
      ? this.t.instant('userSearchSelect.me')
      : `${beneficiary.first_name || ''} ${beneficiary.last_name || ''}`.trim() || beneficiary.email || beneficiary.username || 'User';
    return {
      value: beneficiary.pk,
      label: name,
      secondaryLabel: beneficiary.email,
      image: beneficiary.picture || undefined,
      initials: this.getUserInitials(beneficiary),
      isCurrentUser,
      isPractitioner: beneficiary.is_practitioner,
    };
  });

  queueOptions = computed<SelectOption[]>(() =>
    this.queues().map(queue => ({
      value: queue.id.toString(),
      label: queue.name,
    }))
  );

  beneficiaryAsUser = computed<User | null>(() => {
    const b = this.selectedBeneficiary();
    if (!b) return null;
    return {
      id: b.pk,
      email: b.email,
      first_name: b.first_name,
      last_name: b.last_name,
      picture: b.picture,
    };
  });

  ownerAsUser = computed<User | null>(() => {
    const o = this.selectedOwner();
    if (!o) return null;
    return {
      id: o.pk,
      email: o.email,
      first_name: o.first_name,
      last_name: o.last_name,
      picture: o.picture,
    };
  });

  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;

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
          return {
            value: user.pk,
            label: name,
            secondaryLabel: user.email,
            image: user.picture || undefined,
            initials: this.getUserInitials(user),
            isCurrentUser,
            isPractitioner: user.is_practitioner,
          };
        });
        return { results, hasMore: response.next !== null };
      })
    );
  };

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
          return {
            value: user.pk,
            label: name,
            secondaryLabel: user.email,
            image: user.picture || undefined,
            initials: this.getUserInitials(user),
            isCurrentUser,
            isPractitioner: user.is_practitioner,
          };
        });
        return { results, hasMore: response.next !== null };
      })
    );
  };

  constructor() {
    this.consultationForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      beneficiary_id: [''],
      owned_by_id: [''],
      group_id: [''],
      visible_by_patient: [true],
    });
  }

  ngOnInit(): void {
    this.loadQueues();
    this.loadCurrentUser();
    this.setupBeneficiarySync();
    this.setupOwnerSync();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadQueues(): void {
    this.consultationService.getQueues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: queues => {
          this.queues.set(queues);
          if (queues.length === 0) {
            this.consultationForm.get('group_id')?.disable();
          }
        },
      });
  }

  private loadCurrentUser(): void {
    this.userService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUser.set(user);
    });
    if (!this.currentUser()) {
      this.userService.getCurrentUser().pipe(takeUntil(this.destroy$)).subscribe();
    }
  }

  private setupBeneficiarySync(): void {
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
  }

  private getUserInitials(user: IUser): string {
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return (firstName || lastName || user.email || 'U').charAt(0).toUpperCase();
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
    this.beneficiaryCache.set(patient.pk, patient);
    this.selectedBeneficiary.set(patient);
    this.consultationForm.patchValue({ beneficiary_id: patient.pk });
    this.closeAddPatientModal();
  }

  onAppointmentDataReady(data: CreateAppointmentRequest): void {
    this.pendingAppointmentData.set(data);
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
    }
    return '';
  }

  onClose(): void {
    this.closed.emit();
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

    // If scheduling is enabled, trigger appointment form validation and data collection
    if (this.showSchedule()) {
      const apptForm = this.appointmentFormRef();
      if (apptForm) {
        apptForm.submit();
        // Wait a tick for the appointmentDataReady event to fire
        setTimeout(() => this.doCreate(), 0);
        return;
      }
    }

    this.doCreate();
  }

  private doCreate(): void {
    this.isSaving.set(true);
    const formValue = this.consultationForm.value;

    const beneficiaryId = typeof formValue.beneficiary_id === 'number'
      ? formValue.beneficiary_id
      : (formValue.beneficiary_id ? parseInt(formValue.beneficiary_id) : undefined);
    const ownedById = typeof formValue.owned_by_id === 'number'
      ? formValue.owned_by_id
      : (formValue.owned_by_id ? parseInt(formValue.owned_by_id) : undefined);

    const consultationData: CreateConsultationRequest = {
      title: formValue.title,
      group_id: formValue.group_id ? parseInt(formValue.group_id) : undefined,
      beneficiary_id: beneficiaryId,
      owned_by_id: ownedById,
      visible_by_patient: formValue.visible_by_patient,
    };

    this.consultationService.createConsultation(consultationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: consultation => {
          const appointmentData = this.pendingAppointmentData();
          if (this.showSchedule() && appointmentData) {
            this.createAppointment(consultation.id, appointmentData);
          } else {
            this.onSuccess(consultation.id);
          }
        },
        error: (error) => {
          this.isSaving.set(false);
          this.toasterService.show('error', this.t.instant('consultationForm.errorCreating'), getErrorMessage(error));
        },
      });
  }

  private createAppointment(consultationId: number, data: CreateAppointmentRequest): void {
    this.consultationService.createConsultationAppointment(consultationId, data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.onSuccess(consultationId),
        error: () => {
          this.toasterService.show(
            'warning',
            this.t.instant('consultationForm.consultationCreated'),
            this.t.instant('consultationForm.someAppointmentsNotCreated')
          );
          this.onSuccess(consultationId);
        },
      });
  }

  private onSuccess(consultationId: number): void {
    this.isSaving.set(false);
    this.toasterService.show(
      'success',
      this.t.instant('consultationForm.consultationCreated'),
      this.t.instant('consultationForm.consultationCreatedMessage')
    );
    this.consultationCreated.emit(consultationId);
    this.closed.emit();
    this.router.navigate([
      `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
      consultationId,
    ]);
  }
}

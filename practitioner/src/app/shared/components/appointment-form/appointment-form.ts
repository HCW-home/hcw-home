import {
  Input,
  inject,
  signal,
  Output,
  OnInit,
  OnChanges,
  OnDestroy,
  Component,
  EventEmitter,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormGroup,
  FormsModule,
  Validators,
  FormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { Auth } from '../../../core/services/auth';
import { ConsultationService } from '../../../core/services/consultation.service';
import { ToasterService } from '../../../core/services/toaster.service';
import { UserService } from '../../../core/services/user.service';
import {
  User,
  Participant,
  Appointment,
  AppointmentType,
  ITemporaryParticipant,
  UpdateAppointmentRequest,
  CreateAppointmentRequest,
  CreateParticipantRequest,
} from '../../../core/models/consultation';
import { IUser } from '../../../modules/user/models/user';

import { Button } from '../../ui-components/button/button';
import { Input as InputComponent } from '../../ui-components/input/input';
import { Select } from '../../ui-components/select/select';
import { Checkbox } from '../../ui-components/checkbox/checkbox';
import { Switch } from '../../ui-components/switch/switch';
import { Svg } from '../../ui-components/svg/svg';
import { Loader } from '../loader/loader';
import { UserSearchSelect } from '../user-search-select/user-search-select';
import { ParticipantItem } from '../participant-item/participant-item';
import {
  ButtonStyleEnum,
  ButtonSizeEnum,
  ButtonStateEnum,
} from '../../constants/button';
import { SelectOption } from '../../models/select';
import { extractDateFromISO, extractTimeFromISO } from '../../tools/helper';
import { getErrorMessage } from '../../../core/utils/error-helper';
import { TIMEZONE_OPTIONS } from '../../constants/timezone';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-appointment-form',
  templateUrl: './appointment-form.html',
  styleUrl: './appointment-form.scss',
  imports: [
    Svg,
    Loader,
    Select,
    Button,
    Switch,
    Checkbox,
    CommonModule,
    InputComponent,
    ParticipantItem,
    UserSearchSelect,
    ReactiveFormsModule,
    FormsModule,
    TranslatePipe,
  ],
})
export class AppointmentForm implements OnInit, OnDestroy, OnChanges {
  @Input() consultationId?: number;
  @Input() editingAppointment: Appointment | null = null;
  @Input() showActions = true;
  @Input() autoSave = true;
  @Input() beneficiary: User | null = null;
  @Input() owner: User | null = null;
  @Input() initialStartDate: Date | null = null;
  @Input() initialEndDate: Date | null = null;

  @Output() cancelled = new EventEmitter<void>();
  @Output() appointmentCreated = new EventEmitter<Appointment>();
  @Output() appointmentUpdated = new EventEmitter<Appointment>();
  @Output() appointmentDataReady = new EventEmitter<CreateAppointmentRequest>();

  private destroy$ = new Subject<void>();
  private fb = inject(FormBuilder);
  private authService = inject(Auth);
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private userService = inject(UserService);
  private t = inject(TranslationService);

  isSubmitting = signal(false);
  currentUser = signal<IUser | null>(null);
  availableCommunicationMethods = signal<string[]>([]);
  appointmentForm!: FormGroup;
  backendErrors = signal<Record<string, string[]>>({});

  participants = signal<Participant[]>([]);
  pendingParticipants = signal<CreateParticipantRequest[]>([]);
  isLoadingParticipants = signal(false);
  isAddingParticipant = signal(false);
  showAddParticipantForm = signal(false);
  isExistingUser = signal(true);
  selectedParticipantUser = signal<IUser | null>(null);
  participantForm!: FormGroup;

  timezoneOptions: SelectOption[] = TIMEZONE_OPTIONS;

  get hasEmailMethod(): boolean {
    return this.availableCommunicationMethods().includes('email');
  }

  get hasPhoneMethod(): boolean {
    const methods = this.availableCommunicationMethods();
    return methods.includes('sms') || methods.includes('whatsapp');
  }

  get communicationMethods(): SelectOption[] {
    const methods = this.availableCommunicationMethods();
    const options: SelectOption[] = [];
    if (methods.includes('sms')) {
      options.push({
        value: 'sms',
        label: this.t.instant('appointmentForm.sms'),
      });
    }
    if (methods.includes('whatsapp')) {
      options.push({
        value: 'whatsapp',
        label: this.t.instant('appointmentForm.whatsApp'),
      });
    }
    return options;
  }

  get hasMultipleCommunicationMethods(): boolean {
    return this.communicationMethods.length > 1;
  }

  get shouldShowCommunicationMethodField(): boolean {
    const contactType = this.participantForm?.get('contact_type')?.value;
    return contactType === 'sms' && this.communicationMethods.length > 0;
  }

  get defaultContactType(): string {
    if (this.hasEmailMethod) {
      return 'email';
    } else if (this.hasPhoneMethod) {
      return 'sms';
    } else {
      return 'manual';
    }
  }

  get languageOptions(): SelectOption[] {
    return [
      { value: 'en', label: this.t.instant('appointmentForm.english') },
      { value: 'de', label: this.t.instant('appointmentForm.german') },
      { value: 'fr', label: this.t.instant('appointmentForm.french') },
    ];
  }

  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStateEnum = ButtonStateEnum;
  protected readonly AppointmentType = AppointmentType;

  get isEditMode(): boolean {
    return this.editingAppointment !== null;
  }

  get submitButtonText(): string {
    return this.isEditMode
      ? this.t.instant('appointmentForm.saveChanges')
      : this.t.instant('appointmentForm.createAppointment');
  }

  ngOnInit(): void {
    this.initForm();
    this.initParticipantForm();
    this.loadCurrentUser();
    this.loadConfig();
    this.updateInviteCheckboxStates();

    // Clear backend errors when form values change
    this.appointmentForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (Object.keys(this.backendErrors()).length > 0) {
          this.backendErrors.set({});
        }
      });
  }

  private loadCurrentUser(): void {
    this.userService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUser.set(user);
      });
    if (!this.currentUser()) {
      this.userService
        .getCurrentUser()
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }
  }

  private loadConfig(): void {
    this.authService
      .getOpenIDConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: config => {
          this.availableCommunicationMethods.set(
            config.communication_methods || []
          );
          // Set default contact_type based on available methods
          this.participantForm.patchValue({ contact_type: this.defaultContactType });
        },
      });
  }

  isBeneficiaryCheckboxDisabled(): boolean {
    return !this.beneficiary;
  }

  isPractitionerCheckboxDisabled(): boolean {
    return !this.owner;
  }

  getBeneficiaryUser(): User | null {
    return this.beneficiary;
  }

  getOwnerUser(): User | null {
    return this.owner;
  }

  getCurrentUserForInvite(): IUser | null {
    return this.currentUser();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editingAppointment'] && this.appointmentForm) {
      this.resetForm();
      if (this.editingAppointment) {
        this.populateFormForEdit();
        this.loadParticipants();
      }
    }
    if ((changes['beneficiary'] || changes['owner']) && this.appointmentForm) {
      this.updateInviteCheckboxStates();
    }
    if (
      (changes['initialStartDate'] || changes['initialEndDate']) &&
      this.appointmentForm &&
      !this.editingAppointment
    ) {
      this.populateFormWithInitialDates();
    }
  }

  updateInviteCheckboxStates(): void {
    const beneficiaryControl = this.appointmentForm.get(
      'dont_invite_beneficiary'
    );
    const practitionerControl = this.appointmentForm.get(
      'dont_invite_practitioner'
    );

    if (this.isBeneficiaryCheckboxDisabled()) {
      beneficiaryControl?.disable();
    } else {
      beneficiaryControl?.enable();
    }

    if (this.isPractitionerCheckboxDisabled()) {
      practitionerControl?.disable();
    } else {
      practitionerControl?.enable();
    }
  }

  toggleInvite(controlName: string, invited: boolean): void {
    this.appointmentForm.get(controlName)?.setValue(!invited);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.appointmentForm = this.fb.group({
      type: [AppointmentType.ONLINE, [Validators.required]],
      title: [''],
      date: ['', [Validators.required]],
      time: ['', [Validators.required]],
      end_date: [''],
      end_time: [''],
      dont_invite_beneficiary: [false],
      dont_invite_practitioner: [false],
      dont_invite_me: [false],
    });
  }

  private initParticipantForm(): void {
    const currentUserData = this.currentUser();
    this.participantForm = this.fb.group({
      user_id: [null],
      first_name: [''],
      last_name: [''],
      email: [''],
      phone: [''],
      contact_type: ['email', [Validators.required]],
      timezone: [currentUserData?.timezone || ''],
      communication_method: [currentUserData?.communication_method || ''],
      preferred_language: [currentUserData?.preferred_language || ''],
    });

    // Update validators when contact_type changes
    this.participantForm.get('contact_type')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(contactType => {
        this.updateParticipantValidators(contactType);
      });
  }

  private updateParticipantValidators(contactType: string): void {
    const emailControl = this.participantForm.get('email');
    const phoneControl = this.participantForm.get('phone');
    const communicationMethodControl = this.participantForm.get('communication_method');

    // Reset validators
    emailControl?.clearValidators();
    phoneControl?.clearValidators();
    communicationMethodControl?.clearValidators();

    // Reset touched state to prevent red flash
    emailControl?.markAsUntouched();
    phoneControl?.markAsUntouched();
    communicationMethodControl?.markAsUntouched();

    // Apply validators based on contact type
    if (contactType === 'email') {
      emailControl?.setValidators([Validators.required, Validators.email]);
    } else if (contactType === 'sms') {
      phoneControl?.setValidators([Validators.required]);
      if (this.hasMultipleCommunicationMethods) {
        communicationMethodControl?.setValidators([Validators.required]);
        communicationMethodControl?.enable();
      } else {
        // Disable if only one method available
        communicationMethodControl?.disable();
      }
    }

    // Update validity without emitting events
    emailControl?.updateValueAndValidity({ emitEvent: false });
    phoneControl?.updateValueAndValidity({ emitEvent: false });
    communicationMethodControl?.updateValueAndValidity({ emitEvent: false });
  }

  resetForm(): void {
    const currentUserData = this.currentUser();
    this.appointmentForm.reset({
      type: AppointmentType.ONLINE,
      dont_invite_beneficiary: false,
      dont_invite_practitioner: false,
      dont_invite_me: false,
    });
    this.participants.set([]);
    this.pendingParticipants.set([]);
    this.showAddParticipantForm.set(false);
    this.isExistingUser.set(true);
    this.selectedParticipantUser.set(null);
    this.participantForm.reset({
      contact_type: 'email',
      timezone: currentUserData?.timezone || '',
      communication_method: currentUserData?.communication_method || '',
      preferred_language: currentUserData?.preferred_language || '',
    });
    this.backendErrors.set({});
  }

  getFieldError(fieldName: string): string {
    const errors = this.backendErrors();
    if (errors[fieldName] && errors[fieldName].length > 0) {
      return errors[fieldName][0];
    }
    return '';
  }

  getParticipantFieldError(fieldName: string): string {
    const control = this.participantForm.get(fieldName);
    if (control && control.invalid && control.touched) {
      if (control.hasError('required')) {
        return this.t.instant('appointmentForm.fieldRequired');
      }
      if (control.hasError('email')) {
        return this.t.instant('appointmentForm.invalidEmail');
      }
    }
    return '';
  }

  getAppointmentFieldError(fieldName: string): string {
    // Check backend errors first
    const backendError = this.getFieldError(fieldName);
    if (backendError) {
      return backendError;
    }

    // Check validation errors
    const control = this.appointmentForm.get(fieldName);
    if (control && control.invalid && control.touched) {
      if (control.hasError('required')) {
        return this.t.instant('appointmentForm.fieldRequired');
      }
    }
    return '';
  }

  private populateFormForEdit(): void {
    if (!this.editingAppointment) return;

    const dateStr = extractDateFromISO(this.editingAppointment.scheduled_at);
    const timeStr = extractTimeFromISO(this.editingAppointment.scheduled_at);

    let endDateStr = '';
    let endTimeStr = '';
    if (this.editingAppointment.end_expected_at) {
      endDateStr = extractDateFromISO(this.editingAppointment.end_expected_at);
      endTimeStr = extractTimeFromISO(this.editingAppointment.end_expected_at);
    }

    this.appointmentForm.patchValue({
      type: this.editingAppointment.type || AppointmentType.ONLINE,
      title: this.editingAppointment.title || '',
      date: dateStr,
      time: timeStr,
      end_date: endDateStr,
      end_time: endTimeStr,
    });
  }

  private populateFormWithInitialDates(): void {
    if (!this.initialStartDate) return;

    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const formatTime = (date: Date): string => {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const dateStr = formatDate(this.initialStartDate);
    const timeStr = formatTime(this.initialStartDate);

    let endDateStr = '';
    let endTimeStr = '';
    if (this.initialEndDate) {
      endDateStr = formatDate(this.initialEndDate);
      endTimeStr = formatTime(this.initialEndDate);
    }

    this.appointmentForm.patchValue({
      date: dateStr,
      time: timeStr,
      end_date: endDateStr,
      end_time: endTimeStr,
    });
  }

  loadParticipants(): void {
    if (!this.editingAppointment) return;

    this.participants.set(
      this.editingAppointment.participants.filter(p => p.is_active)
    );
  }

  setAppointmentType(type: AppointmentType): void {
    this.appointmentForm.patchValue({ type });
  }

  setParticipantType(isExisting: boolean): void {
    this.isExistingUser.set(isExisting);
    this.selectedParticipantUser.set(null);
    const currentUserData = this.currentUser();
    this.participantForm.reset({
      contact_type: this.defaultContactType,
      timezone: currentUserData?.timezone || '',
      communication_method: currentUserData?.communication_method || '',
      preferred_language: currentUserData?.preferred_language || '',
      user_id: null,
    });
  }

  setParticipantMessageType(type: string): void {
    let communicationMethod = '';

    if (type === 'email') {
      communicationMethod = 'email';
    } else if (type === 'manual') {
      communicationMethod = 'manual';
    } else if (type === 'sms') {
      // Auto-select communication method if only one is available
      const methods = this.communicationMethods;
      if (methods.length === 1) {
        communicationMethod = String(methods[0].value);
      }
    }

    this.participantForm.patchValue({
      contact_type: type,
      communication_method: communicationMethod,
    });
  }

  onParticipantUserSelected(user: IUser | null): void {
    if (!user) return;
    const data: CreateParticipantRequest = {
      user_id: user.pk,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
    };
    this.pendingParticipants.update(list => [...list, data]);
    this.resetParticipantForm();
  }

  toggleAddParticipantForm(): void {
    this.showAddParticipantForm.update(v => !v);
    if (!this.showAddParticipantForm()) {
      this.resetParticipantForm();
    }
  }

  addParticipant(): void {
    // Mark all fields as touched to show validation errors
    Object.keys(this.participantForm.controls).forEach(key => {
      this.participantForm.get(key)?.markAsTouched();
    });

    // Check if form is valid
    if (this.participantForm.invalid) {
      return;
    }

    const formValue = this.participantForm.getRawValue();
    const data: CreateParticipantRequest = {};

    if (formValue.timezone) {
      data.timezone = formValue.timezone;
    }
    if (formValue.preferred_language) {
      data.preferred_language = formValue.preferred_language;
    }
    if (formValue.first_name) {
      data.first_name = formValue.first_name;
    }
    if (formValue.last_name) {
      data.last_name = formValue.last_name;
    }

    // Determine communication_method based on contact_type
    let communicationMethod = formValue.communication_method;
    if (formValue.contact_type === 'email') {
      communicationMethod = 'email';
      data.email = formValue.email;
    } else if (formValue.contact_type === 'sms') {
      data.mobile_phone_number = formValue.phone;
      // Use the selected method, or default to the first available if not set
      if (!communicationMethod) {
        const methods = this.communicationMethods;
        communicationMethod = methods.length > 0 ? String(methods[0].value) : 'sms';
      }
    } else if (formValue.contact_type === 'manual') {
      communicationMethod = 'manual';
    }

    if (communicationMethod) {
      data.communication_method = communicationMethod;
    }

    this.pendingParticipants.update(list => [...list, data]);
    this.resetParticipantForm();
  }

  private resetParticipantForm(): void {
    const currentUserData = this.currentUser();
    this.participantForm.reset({
      contact_type: this.defaultContactType,
      timezone: currentUserData?.timezone || '',
      communication_method: currentUserData?.communication_method || '',
      preferred_language: currentUserData?.preferred_language || '',
    });
    this.isExistingUser.set(true);
    this.selectedParticipantUser.set(null);
    this.showAddParticipantForm.set(false);
  }

  getTotalParticipantsCount(): number {
    let count = this.participants().length + this.pendingParticipants().length;
    if (!this.isEditMode) {
      if (this.beneficiary) count++;
      if (this.owner) count++;
      if (this.currentUser()) count++;
    }
    return count;
  }

  removePendingParticipant(index: number): void {
    this.pendingParticipants.update(list => list.filter((_, i) => i !== index));
  }

  removeParticipant(participant: Participant): void {
    this.participants.update(list => list.filter(p => p.id !== participant.id));
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  submit(): void {
    // Mark all fields as touched to show validation errors
    Object.keys(this.appointmentForm.controls).forEach(key => {
      this.appointmentForm.get(key)?.markAsTouched();
    });

    if (!this.appointmentForm.valid) return;

    this.isSubmitting.set(true);
    const formValue = this.appointmentForm.value;

    const scheduledAt = `${formValue.date}T${formValue.time}`;

    // Validate scheduled time is not in the past
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate < new Date()) {
      this.backendErrors.set({
        date: [this.t.instant('appointmentForm.scheduledInPast')],
        time: [this.t.instant('appointmentForm.scheduledInPast')],
      });
      this.isSubmitting.set(false);
      return;
    }

    let endExpectedAt: string | undefined;
    if (formValue.end_date && formValue.end_time) {
      endExpectedAt = `${formValue.end_date}T${formValue.end_time}`;
    }

    const { participants_ids, temporary_participants } =
      this.getParticipantsForRequest();

    if (this.isEditMode && this.editingAppointment) {
      const updateData: UpdateAppointmentRequest = {
        type: formValue.type as AppointmentType,
        title: formValue.title || undefined,
        scheduled_at: scheduledAt,
        end_expected_at: endExpectedAt,
        participants_ids,
        temporary_participants,
      };
      this.updateAppointment(updateData);
    } else {
      const createData: CreateAppointmentRequest = {
        type: formValue.type as AppointmentType,
        title: formValue.title || undefined,
        scheduled_at: scheduledAt,
        end_expected_at: endExpectedAt,
        dont_invite_beneficiary: formValue.dont_invite_beneficiary || false,
        dont_invite_practitioner: formValue.dont_invite_practitioner || false,
        dont_invite_me: formValue.dont_invite_me || false,
        participants_ids,
        temporary_participants,
      };

      if (!this.autoSave) {
        this.isSubmitting.set(false);
        this.appointmentDataReady.emit(createData);
      } else {
        this.createAppointment(createData);
      }
    }
  }

  private getParticipantsForRequest(): {
    participants_ids: number[];
    temporary_participants: ITemporaryParticipant[];
  } {
    const participants_ids: number[] = [];
    const temporary_participants: ITemporaryParticipant[] = [];

    for (const p of this.participants()) {
      if (p.user?.id) {
        participants_ids.push(p.user.id);
      }
    }

    for (const pending of this.pendingParticipants()) {
      if (pending.user_id) {
        participants_ids.push(pending.user_id);
      } else {
        const tempParticipant: ITemporaryParticipant = {};
        if (pending.first_name) {
          tempParticipant.first_name = pending.first_name;
        }
        if (pending.last_name) {
          tempParticipant.last_name = pending.last_name;
        }
        if (pending.email) {
          tempParticipant.email = pending.email;
        }
        if (pending.mobile_phone_number) {
          tempParticipant.mobile_phone_number = pending.mobile_phone_number;
        }
        if (pending.timezone) {
          tempParticipant.timezone = pending.timezone;
        }
        if (pending.communication_method) {
          tempParticipant.communication_method = pending.communication_method;
        }
        if (pending.preferred_language) {
          tempParticipant.preferred_language = pending.preferred_language;
        }
        temporary_participants.push(tempParticipant);
      }
    }

    return { participants_ids, temporary_participants };
  }

  private updateAppointment(appointmentData: UpdateAppointmentRequest): void {
    if (!this.editingAppointment) return;

    this.backendErrors.set({});
    this.consultationService
      .updateAppointment(this.editingAppointment.id, appointmentData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: updatedAppointment => {
          this.isSubmitting.set(false);
          this.appointmentUpdated.emit(updatedAppointment);
        },
        error: error => {
          this.isSubmitting.set(false);

          if (error.status === 400 && error.error) {
            const backendErrors = error.error;
            const mappedErrors: Record<string, string[]> = {};

            // Map backend field names to form field names
            if (backendErrors['scheduled_at']) {
              mappedErrors['date'] = backendErrors['scheduled_at'];
              mappedErrors['time'] = backendErrors['scheduled_at'];
            }
            if (backendErrors['end_expected_at']) {
              mappedErrors['end_date'] = backendErrors['end_expected_at'];
              mappedErrors['end_time'] = backendErrors['end_expected_at'];
            }
            // Copy other errors as-is
            Object.keys(backendErrors).forEach(key => {
              if (key !== 'scheduled_at' && key !== 'end_expected_at') {
                mappedErrors[key] = backendErrors[key];
              }
            });

            this.backendErrors.set(mappedErrors);
          } else {
            this.toasterService.show(
              'error',
              this.t.instant('appointmentForm.errorUpdatingAppointment'),
              getErrorMessage(error)
            );
          }
        },
      });
  }

  private createAppointment(appointmentData: CreateAppointmentRequest): void {
    this.backendErrors.set({});
    const createObservable = this.consultationId
      ? this.consultationService.createConsultationAppointment(
          this.consultationId,
          appointmentData
        )
      : this.consultationService.createAppointment(appointmentData);

    createObservable.pipe(takeUntil(this.destroy$)).subscribe({
      next: appointment => {
        this.isSubmitting.set(false);
        this.toasterService.show(
          'success',
          this.t.instant('appointmentForm.appointmentCreated'),
          this.t.instant('appointmentForm.appointmentCreatedMessage')
        );
        this.appointmentCreated.emit(appointment);
      },
      error: error => {
        this.isSubmitting.set(false);

        if (error.status === 400 && error.error) {
          const backendErrors = error.error;
          const mappedErrors: Record<string, string[]> = {};

          // Map backend field names to form field names
          if (backendErrors['scheduled_at']) {
            mappedErrors['date'] = backendErrors['scheduled_at'];
            mappedErrors['time'] = backendErrors['scheduled_at'];
          }
          if (backendErrors['end_expected_at']) {
            mappedErrors['end_date'] = backendErrors['end_expected_at'];
            mappedErrors['end_time'] = backendErrors['end_expected_at'];
          }
          // Copy other errors as-is
          Object.keys(backendErrors).forEach(key => {
            if (key !== 'scheduled_at' && key !== 'end_expected_at') {
              mappedErrors[key] = backendErrors[key];
            }
          });

          this.backendErrors.set(mappedErrors);
        } else {
          this.toasterService.show(
            'error',
            this.t.instant('appointmentForm.errorCreatingAppointment'),
            getErrorMessage(error)
          );
        }
      },
    });
  }
}

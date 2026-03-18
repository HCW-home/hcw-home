import { Component, input, output, inject, OnInit, OnDestroy, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { Button } from '../../../../shared/ui-components/button/button';
import { Input } from '../../../../shared/ui-components/input/input';
import { Select } from '../../../../shared/ui-components/select/select';
import { Switch } from '../../../../shared/ui-components/switch/switch';
import { Textarea } from '../../../../shared/ui-components/textarea/textarea';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { ButtonSizeEnum, ButtonStyleEnum } from '../../../../shared/constants/button';
import { PatientService, IPatientCreateRequest, IPatientUpdateRequest } from '../../../../core/services/patient.service';
import { ConsultationService } from '../../../../core/services/consultation.service';
import { UserService } from '../../../../core/services/user.service';
import { Auth } from '../../../../core/services/auth';
import { IOpenIDConfig } from '../../../../core/models/admin-auth';
import { ToasterService } from '../../../../core/services/toaster.service';
import { IUser, ILanguage } from '../../models/user';
import { CommunicationMethodEnum, CommunicationMethodOptions } from '../../constants/user';
import { CustomField } from '../../../../core/models/consultation';
import { SelectOption } from '../../../../shared/models/select';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-add-edit-patient',
  imports: [CommonModule, ReactiveFormsModule, Typography, Button, Input, Select, Switch, Textarea, TranslatePipe],
  templateUrl: './add-edit-patient.html',
  styleUrl: './add-edit-patient.scss',
})
export class AddEditPatient implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private fb = inject(FormBuilder);
  private patientService = inject(PatientService);
  private consultationService = inject(ConsultationService);
  private userService = inject(UserService);
  private authService = inject(Auth);
  private toasterService = inject(ToasterService);
  private t = inject(TranslationService);

  patient = input<IUser | null>(null);
  initialName = input<string>('');

  saved = output<IUser>();
  cancelled = output<void>();

  constructor() {
    effect(() => {
      const patient = this.patient();
      if (this.form) {
        this.reinitializeForm(patient);
      }
    });

    effect(() => {
      const name = this.initialName();
      if (this.form && name && !this.patient()) {
        const parsed = this.parseInitialInput(name);
        this.form.patchValue(parsed);
      }
    });
  }

  private capitalizeFirstLetter(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private parseInitialInput(input: string): Record<string, string> {
    const trimmed = input.trim();

    // Format: "Prénom Nom <email>" (e.g. "Anaïs FK.AUDIT <Anais.fkaudit@example.com>")
    const namedEmailMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (namedEmailMatch) {
      const namePart = namedEmailMatch[1].trim();
      const email = namedEmailMatch[2].trim();
      const words = namePart.split(/\s+/);
      const firstName = this.capitalizeFirstLetter(words[0]);
      const lastName = words.slice(1).map(w => this.capitalizeFirstLetter(w)).join(' ');
      return { first_name: firstName, last_name: lastName, email };
    }

    // Phone number format (starts with + or contains mostly digits)
    if (/^\+?\d[\d\s\-().]+$/.test(trimmed)) {
      return { mobile_phone_number: trimmed.replace(/\s+/g, ' ') };
    }

    // Email format
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { email: trimmed };
    }

    const words = trimmed.split(/\s+/);

    // Two or more words: first word = first_name, rest = last_name
    if (words.length >= 2) {
      const firstName = this.capitalizeFirstLetter(words[0]);
      const lastName = words.slice(1).map(w => this.capitalizeFirstLetter(w)).join(' ');
      return { first_name: firstName, last_name: lastName };
    }

    // Single word: last_name
    return { last_name: this.capitalizeFirstLetter(trimmed) };
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;

  form!: FormGroup;
  customFieldsForm!: FormGroup;
  loading = false;
  languageOptions: SelectOption[] = [];
  communicationMethodOptions: SelectOption[] = [];
  private availableCommunicationMethods: string[] = [];
  customFields = signal<CustomField[]>([]);

  private readonly communicationMethodLabels: Record<string, string> = {
    [CommunicationMethodEnum.SMS]: 'SMS',
    [CommunicationMethodEnum.EMAIL]: 'Email',
    [CommunicationMethodEnum.WHATSAPP]: 'WhatsApp',
    [CommunicationMethodEnum.PUSH]: 'Push Notification',
    [CommunicationMethodEnum.MANUAL]: 'Manual',
  };

  get isEditMode(): boolean {
    return !!this.patient();
  }

  ngOnInit(): void {
    this.initForm();
    this.loadConfig();
    this.loadCustomFields();
    this.setupCommunicationMethodAutoSelect();
  }

  private loadConfig(): void {
    this.authService.getOpenIDConfig().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (config: IOpenIDConfig) => {
        this.languageOptions = (config.languages || []).map((lang: { code: string; name: string }) => ({
          value: lang.code,
          label: lang.name
        }));

        this.availableCommunicationMethods = config.communication_methods || [];
        if (!this.availableCommunicationMethods.includes(CommunicationMethodEnum.MANUAL)) {
          this.availableCommunicationMethods.push(CommunicationMethodEnum.MANUAL);
        }
        this.updateCommunicationMethodOptions();

        if (!this.isEditMode) {
          this.autoSelectCommunicationMethod();
        }
      }
    });
  }

  private setupCommunicationMethodAutoSelect(): void {
    this.form.get('email')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateCommunicationMethodOptions();
        if (!this.isEditMode) {
          this.autoSelectCommunicationMethod();
        }
      });

    this.form.get('mobile_phone_number')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateCommunicationMethodOptions();
        if (!this.isEditMode) {
          this.autoSelectCommunicationMethod();
        }
      });
  }

  private updateCommunicationMethodOptions(): void {
    const email = this.form.get('email')?.value?.trim();
    const phone = this.form.get('mobile_phone_number')?.value?.trim();
    const hasEmail = !!email;
    const hasPhone = !!phone;

    this.communicationMethodOptions = this.availableCommunicationMethods.map(method => {
      let disabled = false;
      if (method === CommunicationMethodEnum.EMAIL && !hasEmail) {
        disabled = true;
      }
      if ((method === CommunicationMethodEnum.SMS || method === CommunicationMethodEnum.WHATSAPP) && !hasPhone) {
        disabled = true;
      }
      return {
        value: method,
        label: this.communicationMethodLabels[method] || method,
        disabled,
      };
    });

    // If current selection is now disabled, clear it
    const currentMethod = this.form.get('communication_method')?.value;
    if (currentMethod) {
      const currentOption = this.communicationMethodOptions.find(o => o.value === currentMethod);
      if (currentOption?.disabled) {
        this.form.patchValue({ communication_method: '' }, { emitEvent: false });
      }
    }
  }

  private autoSelectCommunicationMethod(): void {
    if (!this.availableCommunicationMethods.length) return;

    const email = this.form.get('email')?.value?.trim();
    const phone = this.form.get('mobile_phone_number')?.value?.trim();
    const hasEmail = !!email;
    const hasPhone = !!phone;

    const phoneMethodsAvailable = this.availableCommunicationMethods.filter(
      m => m === CommunicationMethodEnum.SMS || m === CommunicationMethodEnum.WHATSAPP
    );

    if (hasPhone && phoneMethodsAvailable.length > 1) {
      return;
    }

    if (hasPhone && phoneMethodsAvailable.length === 1) {
      this.form.patchValue({ communication_method: phoneMethodsAvailable[0] }, { emitEvent: false });
      return;
    }

    if (hasEmail && this.availableCommunicationMethods.includes(CommunicationMethodEnum.EMAIL)) {
      this.form.patchValue({ communication_method: CommunicationMethodEnum.EMAIL }, { emitEvent: false });
      return;
    }

    if (!hasEmail && !hasPhone && this.availableCommunicationMethods.includes(CommunicationMethodEnum.MANUAL)) {
      this.form.patchValue({ communication_method: CommunicationMethodEnum.MANUAL }, { emitEvent: false });
      return;
    }
  }

  private loadCustomFields(): void {
    this.consultationService.getCustomFields('users.User').pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (fields) => {
        this.customFields.set(fields);
        this.customFieldsForm = this.fb.group({});
        const patient = this.patient();
        for (const field of fields) {
          const existingValue = patient?.custom_fields?.find(cf => cf.field === field.id);
          this.customFieldsForm.addControl(
            `cf_${field.id}`,
            new FormControl(existingValue?.value || '', field.required ? Validators.required : [])
          );
        }
      }
    });
  }

  getCustomFieldOptions(field: CustomField): SelectOption[] {
    return (field.options || []).map(o => ({ value: o, label: o }));
  }

  private buildCustomFieldsPayload(): { field: number; value: string | null }[] {
    if (!this.customFields().length) return [];
    return this.customFields().map(field => ({
      field: field.id,
      value: this.customFieldsForm.get(`cf_${field.id}`)?.value || null
    }));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    const p = this.patient();
    let firstName = p?.first_name || '';
    let lastName = p?.last_name || '';
    let email = p?.email || '';
    let phone = p?.mobile_phone_number || '';

    // If creating a new patient and initialName is provided, parse it
    if (!p && this.initialName()) {
      const parsed = this.parseInitialInput(this.initialName());
      firstName = parsed['first_name'] || firstName;
      lastName = parsed['last_name'] || lastName;
      email = parsed['email'] || email;
      phone = parsed['mobile_phone_number'] || phone;
    }

    this.form = this.fb.group({
      first_name: [firstName],
      last_name: [lastName],
      email: [email, [Validators.email]],
      mobile_phone_number: [phone],
      communication_method: [p?.communication_method || '', [Validators.required]],
      timezone: [p?.timezone || 'UTC'],
      preferred_language: [p?.preferred_language || null],
      temporary: [p?.temporary || false]
    });
  }

  private reinitializeForm(p: IUser | null): void {
    this.form.patchValue({
      first_name: p?.first_name || '',
      last_name: p?.last_name || '',
      email: p?.email || '',
      mobile_phone_number: p?.mobile_phone_number || '',
      communication_method: p?.communication_method || '',
      timezone: p?.timezone || 'UTC',
      preferred_language: p?.preferred_language || null,
      temporary: p?.temporary || false
    });

    // Repopulate custom field values
    if (this.customFieldsForm && p?.custom_fields) {
      for (const cf of p.custom_fields) {
        const control = this.customFieldsForm.get(`cf_${cf.field}`);
        if (control) {
          control.setValue(cf.value || '');
        }
      }
    }
  }

  getInitials(): string {
    const firstName = this.form.get('first_name')?.value || '';
    const lastName = this.form.get('last_name')?.value || '';
    const first = firstName.charAt(0) || '';
    const last = lastName.charAt(0) || '';
    return (first + last).toUpperCase() || 'N';
  }

  onSave(): void {
    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach(key => {
        this.form.get(key)?.markAsTouched();
      });
      return;
    }

    this.loading = true;
    const formValue = this.form.getRawValue();

    if (this.isEditMode) {
      const updateData: IPatientUpdateRequest = {
        email: formValue.email,
        first_name: formValue.first_name,
        last_name: formValue.last_name,
        mobile_phone_number: formValue.mobile_phone_number,
        communication_method: formValue.communication_method,
        timezone: formValue.timezone,
        preferred_language: formValue.preferred_language,
        custom_fields: this.buildCustomFieldsPayload(),
        temporary: formValue.temporary
      };

      this.patientService.updatePatient(this.patient()!.pk, updateData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (updatedPatient) => {
          this.toasterService.show('success', this.t.instant('addEditPatient.patientUpdated'), this.t.instant('addEditPatient.patientUpdatedMessage'));
          this.loading = false;
          this.saved.emit(updatedPatient);
        },
        error: (error) => {
          this.setServerErrors(error);
          this.toasterService.show('error', this.t.instant('addEditPatient.errorUpdating'), getErrorMessage(error));
          this.loading = false;
        }
      });
    } else {
      const createData: IPatientCreateRequest = {
        first_name: formValue.first_name,
        last_name: formValue.last_name,
        email: formValue.email,
        mobile_phone_number: formValue.mobile_phone_number,
        communication_method: formValue.communication_method,
        timezone: formValue.timezone,
        preferred_language: formValue.preferred_language,
        language_ids: [],
        custom_fields: this.buildCustomFieldsPayload(),
        temporary: formValue.temporary
      };

      this.patientService.createPatient(createData).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (createdPatient) => {
          this.toasterService.show('success', this.t.instant('addEditPatient.patientCreated'), this.t.instant('addEditPatient.patientCreatedMessage'));
          this.loading = false;
          this.saved.emit(createdPatient);
        },
        error: (error) => {
          this.setServerErrors(error);
          this.toasterService.show('error', this.t.instant('addEditPatient.errorCreating'), getErrorMessage(error));
          this.loading = false;
        }
      });
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  getFieldError(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (field?.errors?.['serverError']) {
      return field.errors['serverError'];
    }
    if (field?.errors?.['required']) {
      return this.t.instant('addEditPatient.fieldRequired');
    }
    if (field?.errors?.['email']) {
      return this.t.instant('addEditPatient.invalidEmail');
    }
    return '';
  }

  private setServerErrors(error: { error?: Record<string, string | string[]> }): void {
    if (error.error && typeof error.error === 'object') {
      for (const [field, messages] of Object.entries(error.error)) {
        const control = this.form.get(field);
        if (control) {
          const msg = Array.isArray(messages) ? messages[0] : messages;
          control.setErrors({ serverError: msg });
          control.markAsTouched();
        }
      }
    }
  }
}

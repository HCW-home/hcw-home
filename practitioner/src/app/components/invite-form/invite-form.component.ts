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
  @Input() practitionerId!: number; // Required practitioner ID
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<CreatePatientConsultationFormData>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;

  form!: FormGroup;
  genders = ['Male', 'Female', 'Other'];
  languages = ['English', 'French', 'German'];
  groups = ['Group A', 'Group B'];
  guestOptions = [
    { key: 'lovedOne', label: 'Invite a loved one or another caregiver' },
    { key: 'colleague', label: 'Invite a colleague' },
  ];

  get isEditMode(): boolean {
    return this.editData !== null;
  }

  get modalTitle(): string {
    return this.isEditMode ? 'EDIT PATIENT' : 'CREATE PATIENT & CONSULTATION';
  }

  get submitButtonText(): string {
    return this.isEditMode ? 'Update' : 'Create';
  }

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    document.body.classList.add('modal-open');
    this.form = this.buildForm();

    if (this.editData) {
      this.populateFormForEdit();
    }
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      gender: ['', Validators.required],
      language: ['', Validators.required],
      group: [''],
      contact: [
        '',
        [
          Validators.required,
          Validators.pattern(/(^\+\d{2}\d{6,}$)|(^\S+@\S+\.\S+$)/),
        ],
      ],
      scheduledDate: [''],
      symptoms: [''],
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

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
  }

  onCancel(): void {
    document.body.classList.remove('modal-open');
    this.close.emit();
  }

  onSubmit(): void {
    document.body.classList.remove('modal-open');
    this.form.value.scheduledDate = this.form.value.scheduledDate ? new Date(this.form.value.scheduledDate) : new Date();
    const formData: CreatePatientConsultationFormData = {
      firstName: this.form.value.firstName,
      lastName: this.form.value.lastName,
      gender: this.form.value.gender,
      language: this.form.value.language,
      contact: this.form.value.contact,
      group: this.form.value.group || undefined,
      scheduledDate: this.form.value.scheduledDate || undefined,
      symptoms: this.form.value.symptoms || undefined,
    };

    this.submit.emit(formData);
  }
}
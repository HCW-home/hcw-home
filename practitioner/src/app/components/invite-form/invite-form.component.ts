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
import { GuidedTourService } from '../../services/guided-tour.service';
import { TourType } from '../../models/tour';
import { TourMatMenuModule } from 'ngx-ui-tour-md-menu';

@Component({
  selector: 'app-invite-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, TourMatMenuModule],
  templateUrl: './invite-form.component.html',
  styleUrls: ['./invite-form.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class InviteFormComponent implements OnInit, OnDestroy {
  @Input() type: 'remote' = 'remote';
  @Input() editData: InviteFormData | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<any>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;
  readonly TourType = TourType;

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
    return this.isEditMode ? 'EDIT PATIENT INVITATION' : 'PATIENT INVITATION';
  }

  get submitButtonText(): string {
    return this.isEditMode ? 'Update' : 'Send';
  }

  constructor(private fb: FormBuilder, private guidedTourService: GuidedTourService) {}

  ngOnInit(): void {
    document.body.classList.add('modal-open');
    this.form = this.buildRemoteForm();

    if (this.editData) {
      this.populateFormForEdit();
    }
  }

  private buildRemoteForm(): FormGroup {
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
      manualSend: [false],
      planLater: [false],
      guests: this.buildGuestsGroup(),
    });
  }

  private buildGuestsGroup(): FormGroup {
    return this.fb.group({
      lovedOne: [false],
      colleague: [false],
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
      manualSend: this.editData.manualSend,
      planLater: this.editData.planLater,
      guests: {
        lovedOne: this.editData.guests.lovedOne,
        colleague: this.editData.guests.colleague,
      },
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
      this.form.markAllAsTouched();
      return;
    }

    document.body.classList.remove('modal-open');

    const formData = {
      type: this.type,
      ...this.form.value,
      ...(this.editData?.id && { id: this.editData.id }),
    };

    this.submit.emit(formData);
  }
}

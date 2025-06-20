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

@Component({
  selector: 'app-invite-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent],
  templateUrl: './invite-form.component.html',
  styleUrls: ['./invite-form.component.scss'],
  encapsulation: ViewEncapsulation.None, 
})
export class InviteFormComponent implements OnInit, OnDestroy {
  @Input() type: 'remote' | 'inPerson' = 'remote';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<any>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;

  form!: FormGroup;
  genders = ['Male', 'Female', 'Other'];
  languages = ['English', 'French', 'German'];
  guestOptions = [
    { key: 'lovedOne', label: 'Invite a loved one or another caregiver' },
    { key: 'colleague', label: 'Invite a colleague' },
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    document.body.classList.add('modal-open');

    this.form =
      this.type === 'remote'
        ? this.buildRemoteForm()
        : this.buildInPersonForm();
  }

  private buildRemoteForm(): FormGroup {
    return this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      gender: ['', Validators.required],
      language: ['', Validators.required],
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

  private buildInPersonForm(): FormGroup {
    return this.fb.group({
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
    this.submit.emit({ type: this.type, ...this.form.value });
  }
}

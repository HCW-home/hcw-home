import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { Page } from '../../../../core/components/page/page';
import { Loader } from '../../../../shared/components/loader/loader';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { SlotModal } from '../slot-modal/slot-modal';

import { Button } from '../../../../shared/ui-components/button/button';
import { Svg } from '../../../../shared/ui-components/svg/svg';

import { ButtonSizeEnum, ButtonStyleEnum, ButtonStateEnum } from '../../../../shared/constants/button';

import { ConsultationService } from '../../../../core/services/consultation.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { ValidationService } from '../../../../core/services/validation.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ConfirmationService } from '../../../../core/services/confirmation.service';

import { BookingSlot, CreateBookingSlot } from '../../../../core/models/consultation';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';

interface WeekDay {
  key: keyof CreateBookingSlot;
  label: string;
  short: string;
}

@Component({
  selector: 'app-availability',
  standalone: true,
  imports: [
    Page,
    Loader,
    ModalComponent,
    SlotModal,
    Button,
    Svg,
    TranslatePipe,
  ],
  templateUrl: './availability.html',
  styleUrl: './availability.scss',
})
export class Availability implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private fb = inject(FormBuilder);
  private consultationService = inject(ConsultationService);
  private toasterService = inject(ToasterService);
  private validationService = inject(ValidationService);
  private logger = inject(LoggerService);
  private confirmationService = inject(ConfirmationService);
  private t = inject(TranslationService);

  bookingSlots = signal<BookingSlot[]>([]);
  selectedSlot = signal<BookingSlot | null>(null);
  isLoading = signal(false);
  isSaving = signal(false);
  showSlotModal = signal(false);
  modalMode = signal<'create' | 'edit'>('create');

  slotForm: FormGroup;

  weekDays: WeekDay[] = [
    { key: 'monday', label: 'configuration.dayMonday', short: 'configuration.dayMon' },
    { key: 'tuesday', label: 'configuration.dayTuesday', short: 'configuration.dayTue' },
    { key: 'wednesday', label: 'configuration.dayWednesday', short: 'configuration.dayWed' },
    { key: 'thursday', label: 'configuration.dayThursday', short: 'configuration.dayThu' },
    { key: 'friday', label: 'configuration.dayFriday', short: 'configuration.dayFri' },
    { key: 'saturday', label: 'configuration.daySaturday', short: 'configuration.daySat' },
    { key: 'sunday', label: 'configuration.daySunday', short: 'configuration.daySun' }
  ];

  modalTitle = computed(() =>
    this.modalMode() === 'create' ? this.t.instant('configuration.createNewSlot') : this.t.instant('configuration.editTimeSlot')
  );

  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly ButtonStateEnum = ButtonStateEnum;

  constructor() {
    this.slotForm = this.fb.group({
      start_time: ['09:00', [Validators.required]],
      end_time: ['17:00', [Validators.required]],
      start_break: ['12:00'],
      end_break: ['13:00'],
      monday: [true],
      tuesday: [true],
      wednesday: [true],
      thursday: [true],
      friday: [true],
      saturday: [false],
      sunday: [false],
      valid_until: ['']
    });
  }

  ngOnInit(): void {
    this.loadBookingSlots();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBookingSlots(): void {
    this.isLoading.set(true);
    this.consultationService.getBookingSlots()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.bookingSlots.set(response.results);
          this.isLoading.set(false);
        },
        error: (error) => {
          this.logger.error('Error loading booking slots:', error);
          this.isLoading.set(false);
          this.toasterService.show('error', this.t.instant('configuration.errorLoadingSlots'), getErrorMessage(error));
        }
      });
  }

  openSlotModal(mode: 'create' | 'edit', slot?: BookingSlot): void {
    this.modalMode.set(mode);
    this.showSlotModal.set(true);

    if (mode === 'edit' && slot) {
      this.selectedSlot.set(slot);
      this.slotForm.patchValue({
        start_time: this.formatTimeForInput(slot.start_time),
        end_time: this.formatTimeForInput(slot.end_time),
        start_break: slot.start_break ? this.formatTimeForInput(slot.start_break) : '',
        end_break: slot.end_break ? this.formatTimeForInput(slot.end_break) : '',
        monday: slot.monday,
        tuesday: slot.tuesday,
        wednesday: slot.wednesday,
        thursday: slot.thursday,
        friday: slot.friday,
        saturday: slot.saturday,
        sunday: slot.sunday,
        valid_until: slot.valid_until || ''
      });
    } else {
      this.selectedSlot.set(null);
      this.slotForm.reset({
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: false,
        sunday: false
      });
    }
  }

  closeSlotModal(): void {
    this.showSlotModal.set(false);
    this.selectedSlot.set(null);
    this.slotForm.reset();
  }

  saveSlot(): void {
    if (this.slotForm.valid) {
      this.isSaving.set(true);
      const formValue = this.slotForm.value;

      const slotData: CreateBookingSlot = {
        start_time: formValue.start_time,
        end_time: formValue.end_time,
        start_break: formValue.start_break || null,
        end_break: formValue.end_break || null,
        monday: formValue.monday,
        tuesday: formValue.tuesday,
        wednesday: formValue.wednesday,
        thursday: formValue.thursday,
        friday: formValue.friday,
        saturday: formValue.saturday,
        sunday: formValue.sunday,
        valid_until: formValue.valid_until || null
      };

      const operation = this.modalMode() === 'edit' && this.selectedSlot()
        ? this.consultationService.updateBookingSlot(this.selectedSlot()!.id, slotData)
        : this.consultationService.createBookingSlot(slotData);

      operation.pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.toasterService.show('success',
              this.modalMode() === 'edit' ? this.t.instant('configuration.slotUpdated') : this.t.instant('configuration.slotCreated'),
              this.modalMode() === 'edit' ? this.t.instant('configuration.slotUpdatedMessage') : this.t.instant('configuration.slotCreatedMessage')
            );
            this.isSaving.set(false);
            this.closeSlotModal();
            this.loadBookingSlots();
          },
          error: (error) => {
            this.logger.error('Error saving time slot:', error);
            this.isSaving.set(false);
            this.toasterService.show('error', this.t.instant('configuration.errorSavingSlot'), this.t.instant('configuration.failedToSaveSlot'));
          }
        });
    } else {
      this.validationService.validateAllFormFields(this.slotForm);
      this.toasterService.show('error', this.t.instant('configuration.validationError'), this.t.instant('configuration.fillRequiredFields'));
    }
  }

  async confirmDeleteSlot(slot: BookingSlot): Promise<void> {
    const confirmed = await this.confirmationService.confirm({
      title: this.t.instant('configuration.deleteSlotTitle'),
      message: this.t.instant('configuration.deleteSlotMessage'),
      confirmText: this.t.instant('configuration.deleteConfirm'),
      cancelText: this.t.instant('configuration.deleteCancel'),
      confirmStyle: 'danger'
    });

    if (confirmed) {
      this.deleteSlot(slot);
    }
  }

  private deleteSlot(slot: BookingSlot): void {
    this.consultationService.deleteBookingSlot(slot.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toasterService.show('success', this.t.instant('configuration.slotDeleted'), this.t.instant('configuration.slotDeletedMessage'));
          this.loadBookingSlots();
        },
        error: (error) => {
          this.logger.error('Error deleting time slot:', error);
          this.toasterService.show('error', this.t.instant('configuration.errorDeletingSlot'), this.t.instant('configuration.failedToDeleteSlot'));
        }
      });
  }

  formatTimeForInput(timeString: string): string {
    return timeString.substring(0, 5);
  }

  getActiveDaysForSlot(slot: BookingSlot): string[] {
    const activeDays = [];
    if (slot.monday) activeDays.push(this.t.instant('configuration.dayMon'));
    if (slot.tuesday) activeDays.push(this.t.instant('configuration.dayTue'));
    if (slot.wednesday) activeDays.push(this.t.instant('configuration.dayWed'));
    if (slot.thursday) activeDays.push(this.t.instant('configuration.dayThu'));
    if (slot.friday) activeDays.push(this.t.instant('configuration.dayFri'));
    if (slot.saturday) activeDays.push(this.t.instant('configuration.daySat'));
    if (slot.sunday) activeDays.push(this.t.instant('configuration.daySun'));
    return activeDays;
  }

  getSlotTimeRange(slot: BookingSlot): string {
    const start = this.formatTimeForInput(slot.start_time);
    const end = this.formatTimeForInput(slot.end_time);
    return `${start} - ${end}`;
  }

  getBreakTimeRange(slot: BookingSlot): string {
    if (!slot.start_break || !slot.end_break) return this.t.instant('configuration.noBreak');
    const start = this.formatTimeForInput(slot.start_break);
    const end = this.formatTimeForInput(slot.end_break);
    return `${start} - ${end}`;
  }

  isFieldInvalid(formGroup: FormGroup, fieldName: string): boolean {
    return this.validationService.showError(formGroup, fieldName);
  }

  getFieldError(formGroup: FormGroup, fieldName: string): string {
    const field = formGroup.get(fieldName);
    if (field?.errors && field?.touched) {
      if (field.errors['required']) return this.t.instant('configuration.fieldRequired', { field: fieldName });
    }
    return '';
  }
}

import { Component, Input, Output, EventEmitter, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Appointment, User, CreateAppointmentRequest } from '../../../../../core/models/consultation';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { AppointmentForm } from '../../../../../shared/components/appointment-form/appointment-form';
import { TranslationService } from '../../../../../core/services/translation.service';

@Component({
  selector: 'app-appointment-form-modal',
  templateUrl: './appointment-form-modal.html',
  styleUrl: './appointment-form-modal.scss',
  imports: [
    CommonModule,
    ModalComponent,
    AppointmentForm,
  ],
})
export class AppointmentFormModal {
  private t = inject(TranslationService);

  @Input() isOpen = false;
  @Input() consultationId?: number;
  @Input() editingAppointment: Appointment | null = null;
  @Input() autoSave = true;
  @Input() beneficiary: User | null = null;
  @Input() owner: User | null = null;
  @Input() initialStartDate: Date | null = null;
  @Input() initialEndDate: Date | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() appointmentCreated = new EventEmitter<Appointment>();
  @Output() appointmentUpdated = new EventEmitter<Appointment>();
  @Output() appointmentDataReady = new EventEmitter<CreateAppointmentRequest>();

  @ViewChild(AppointmentForm) appointmentForm!: AppointmentForm;

  get isEditMode(): boolean {
    return this.editingAppointment !== null;
  }

  get modalTitle(): string {
    return this.isEditMode ? this.t.instant('appointmentFormModal.editAppointment') : this.t.instant('appointmentFormModal.createNewAppointment');
  }

  onClose(): void {
    if (this.appointmentForm) {
      this.appointmentForm.resetForm();
    }
    this.closed.emit();
  }

  onAppointmentCreated(appointment: Appointment): void {
    this.appointmentCreated.emit(appointment);
    this.onClose();
  }

  onAppointmentUpdated(appointment: Appointment): void {
    this.appointmentUpdated.emit(appointment);
    this.onClose();
  }

  onAppointmentDataReady(data: CreateAppointmentRequest): void {
    this.appointmentDataReady.emit(data);
    this.onClose();
  }
}

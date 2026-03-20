import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonCardContent,
  IonSpinner,
  IonTextarea,
  IonProgressBar,
  NavController,
  ToastController
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { TranslationService } from '../../core/services/translation.service';
import { SpecialityService } from '../../core/services/speciality.service';
import { DoctorService } from '../../core/services/doctor.service';
import { ConsultationService, ConsultationRequestData } from '../../core/services/consultation.service';
import { Speciality, Doctor } from '../../core/models/doctor.model';
import { Reason, Slot, CustomField } from '../../core/models/consultation.model';
import { LocalDatePipe } from '../../shared/pipes/local-date.pipe';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-new-request',
  templateUrl: './new-request.page.html',
  styleUrls: ['./new-request.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonCardContent,
    IonSpinner,
    IonTextarea,
    IonProgressBar,
    TranslatePipe,
    LocalDatePipe
  ]
})
export class NewRequestPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private t = inject(TranslationService);

  currentStep = signal(1);
  totalSteps = 5;
  isLoading = signal(false);
  isSubmitting = signal(false);

  specialities = signal<Speciality[]>([]);
  selectedSpeciality = signal<Speciality | null>(null);

  reasons = signal<Reason[]>([]);
  selectedReason = signal<Reason | null>(null);

  availableSlots = signal<Slot[]>([]);
  selectedSlot = signal<Slot | null>(null);
  currentWeekStart = signal<Date>(this.getStartOfWeek(new Date()));

  doctors = signal<Doctor[]>([]);
  selectedDoctor = signal<Doctor | null>(null);
  doctorNextSlots = signal<Record<number, Slot | null>>({});

  customFields = signal<CustomField[]>([]);
  customFieldValues: Record<number, string> = {};

  comment = '';

  stepTitle = computed(() => {
    switch (this.currentStep()) {
      case 1: return this.t.instant('newRequest.selectSpecialty');
      case 2: return this.t.instant('newRequest.selectReason');
      case 3: return this.t.instant('newRequest.selectDoctor');
      case 4: return this.t.instant('newRequest.chooseTimeSlot');
      case 5: return this.t.instant('newRequest.reviewAndSubmit');
      default: return this.t.instant('newRequest.newRequest');
    }
  });

  progress = computed(() => this.currentStep() / this.totalSteps);

  groupedSlots = computed(() => {
    const slots = this.availableSlots();
    const grouped: { [date: string]: Slot[] } = {};
    slots.forEach(slot => {
      if (!grouped[slot.date]) {
        grouped[slot.date] = [];
      }
      grouped[slot.date].push(slot);
    });
    return grouped;
  });

  weekDates = computed(() => {
    const start = this.currentWeekStart();
    const dates: Date[] = [];
    for (let i = 0; i < 15; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  });

  canGoPreviousWeek = computed(() => {
    const current = this.currentWeekStart();
    const prev = new Date(current);
    prev.setDate(current.getDate() - 15);
    const today = this.getStartOfWeek(new Date());
    return prev >= today;
  });

  constructor(
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private specialityService: SpecialityService,
    private doctorService: DoctorService,
    private consultationService: ConsultationService
  ) {}

  ngOnInit() {
    this.loadSpecialities();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSpecialities(): void {
    this.isLoading.set(true);
    this.specialityService.getSpecialities()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (specialities) => {
          this.specialities.set(specialities);
          this.isLoading.set(false);
        },
        error: () => {
          this.showToast(this.t.instant('newRequest.failedSpecialties'), 'danger');
          this.isLoading.set(false);
        }
      });
  }

  selectSpeciality(speciality: Speciality): void {
    this.selectedSpeciality.set(speciality);
    this.loadReasons(speciality.id);
    this.currentStep.set(2);
  }

  loadReasons(specialityId: number): void {
    this.isLoading.set(true);
    this.specialityService.getReasonsBySpeciality(specialityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (reasons) => {
          this.reasons.set(reasons);
          this.isLoading.set(false);
        },
        error: () => {
          this.showToast(this.t.instant('newRequest.failedReasons'), 'danger');
          this.isLoading.set(false);
        }
      });
  }

  selectReason(reason: Reason): void {
    this.selectedReason.set(reason);
    if (reason.assignment_method === 'appointment') {
      this.loadDoctorsWithNextSlot();
      this.currentStep.set(3);
    } else {
      this.selectedSlot.set(null);
      this.selectedDoctor.set(null);
      this.loadCustomFields();
      this.currentStep.set(5);
    }
  }

  loadAvailableSlots(reasonId: number): void {
    this.isLoading.set(true);
    const fromDate = this.formatDate(this.currentWeekStart());
    const params: { from_date: string; user_id?: number } = { from_date: fromDate };
    const doctor = this.selectedDoctor();
    if (doctor) {
      params.user_id = (doctor as any).pk ?? doctor.id;
    }
    this.doctorService.getAvailableSlots(reasonId, params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (slots) => {
          this.availableSlots.set(slots);
          this.isLoading.set(false);
        },
        error: () => {
          this.showToast(this.t.instant('newRequest.failedSlots'), 'danger');
          this.isLoading.set(false);
        }
      });
  }

  selectSlot(slot: Slot): void {
    this.selectedSlot.set(slot);
  }

  nextWeek(): void {
    const current = this.currentWeekStart();
    const next = new Date(current);
    next.setDate(current.getDate() + 15);
    this.currentWeekStart.set(next);
    const reason = this.selectedReason();
    if (reason) {
      this.loadAvailableSlots(reason.id);
    }
  }

  previousWeek(): void {
    const current = this.currentWeekStart();
    const prev = new Date(current);
    prev.setDate(current.getDate() - 15);
    const today = this.getStartOfWeek(new Date());
    if (prev >= today) {
      this.currentWeekStart.set(prev);
      const reason = this.selectedReason();
      if (reason) {
        this.loadAvailableSlots(reason.id);
      }
    }
  }

  private loadDoctorsWithNextSlot(): void {
    const speciality = this.selectedSpeciality();
    const reason = this.selectedReason();
    if (!speciality || !reason) return;

    this.isLoading.set(true);
    const fromDate = this.formatDate(new Date());

    forkJoin({
      doctors: this.doctorService.getDoctorsBySpeciality(speciality.id),
      slots: this.doctorService.getAvailableSlots(reason.id, { from_date: fromDate }),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ doctors, slots }) => {
        this.doctors.set(doctors);

        // Find the first available slot per doctor
        const nextSlots: Record<number, Slot | null> = {};
        for (const doctor of doctors) {
          const doctorId = (doctor as any).pk ?? doctor.id;
          const doctorSlot = slots.find(s => s.user_id === doctorId) || null;
          nextSlots[doctorId] = doctorSlot;
        }
        this.doctorNextSlots.set(nextSlots);
        this.isLoading.set(false);
      },
      error: () => {
        this.showToast(this.t.instant('newRequest.failedDoctors'), 'danger');
        this.isLoading.set(false);
      }
    });
  }

  selectDoctor(doctor: Doctor): void {
    this.selectedDoctor.set(doctor);
  }

  proceedToSlots(): void {
    const reason = this.selectedReason();
    if (reason) {
      this.loadAvailableSlots(reason.id);
      this.currentStep.set(4);
    }
  }

  skipDoctorSelection(): void {
    this.selectedDoctor.set(null);
    const reason = this.selectedReason();
    if (reason) {
      this.loadAvailableSlots(reason.id);
      this.currentStep.set(4);
    }
  }

  proceedToReview(): void {
    this.loadCustomFields();
    this.currentStep.set(5);
  }

  skipSlotSelection(): void {
    this.selectedSlot.set(null);
    this.loadCustomFields();
    this.currentStep.set(5);
  }

  getDoctorNextSlot(doctor: Doctor): Slot | null {
    const doctorId = (doctor as any).pk ?? doctor.id;
    return this.doctorNextSlots()[doctorId] || null;
  }

  formatSlotDate(slot: Slot): string {
    const date = new Date(`${slot.date}T${slot.start_time}`);
    return date.toLocaleDateString(this.t.currentLanguage(), { weekday: 'short', day: 'numeric', month: 'short' });
  }

  loadCustomFields(): void {
    if (this.customFields().length > 0) return;
    this.consultationService.getCustomFields('consultations.Request')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fields) => this.customFields.set(fields),
      });
  }

  goBack(): void {
    const step = this.currentStep();
    if (step > 1) {
      const reason = this.selectedReason();
      if (step === 5 && reason && reason.assignment_method !== 'appointment') {
        this.currentStep.set(2);
      } else if (step === 5) {
        this.currentStep.set(4);
      } else {
        this.currentStep.set(step - 1);
      }
    } else {
      this.navCtrl.back();
    }
  }

  async submitRequest(): Promise<void> {
    const reason = this.selectedReason();
    const slot = this.selectedSlot();
    const doctor = this.selectedDoctor();

    if (!reason) {
      this.showToast(this.t.instant('newRequest.selectReasonWarning'), 'warning');
      return;
    }

    let expectedAt: string;
    if (slot) {
      expectedAt = `${slot.date}T${slot.start_time}`;
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      expectedAt = tomorrow.toISOString();
    }

    const requestData: ConsultationRequestData = {
      reason_id: reason.id,
      expected_at: expectedAt,
      type: 'online',
      comment: this.comment.trim() || ''
    };

    if (doctor) {
      requestData.expected_with_id = doctor.id;
    }

    const cfPayload = Object.entries(this.customFieldValues)
      .filter(([_, value]) => value !== '' && value !== null && value !== undefined)
      .map(([fieldId, value]) => ({ field: parseInt(fieldId, 10), value }));
    if (cfPayload.length > 0) {
      requestData.custom_fields = cfPayload;
    }

    this.isSubmitting.set(true);
    this.consultationService.createConsultationRequest(requestData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (createdRequest) => {
          this.showToast(this.t.instant('newRequest.submitSuccess'), 'success');
          const requestId = (createdRequest as any).pk ?? (createdRequest as any).id;
          this.navCtrl.navigateBack('/home', {
            queryParams: { highlightRequest: requestId }
          });
        },
        error: () => {
          this.showToast(this.t.instant('newRequest.submitFailed'), 'danger');
          this.isSubmitting.set(false);
        }
      });
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatDisplayDate(date: Date): string {
    return date.toLocaleDateString(this.t.currentLanguage(), { weekday: 'short', month: 'short', day: 'numeric' });
  }

  formatDayName(date: Date): string {
    return date.toLocaleDateString(this.t.currentLanguage(), { weekday: 'short' });
  }

  formatDayNumber(date: Date): string {
    return date.getDate().toString();
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  isPastDate(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < today;
  }

  formatSlotTime(slot: Slot): string {
    return `${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}`;
  }

  getSlotsForDate(date: Date): Slot[] {
    const dateStr = this.formatDate(date);
    return this.groupedSlots()[dateStr] || [];
  }

  isSlotSelected(slot: Slot): boolean {
    const selected = this.selectedSlot();
    return selected !== null &&
      selected.date === slot.date &&
      selected.start_time === slot.start_time &&
      selected.user_id === slot.user_id;
  }

  isDoctorSelected(doctor: Doctor): boolean {
    const selected = this.selectedDoctor();
    if (!selected || !doctor) {
      return false;
    }
    // API returns 'pk' instead of 'id'
    const selectedId = (selected as any).pk ?? selected.id;
    const doctorId = (doctor as any).pk ?? doctor.id;
    return selectedId === doctorId;
  }

  getDoctorFullName(doctor: Doctor): string {
    return `Dr. ${doctor.first_name} ${doctor.last_name}`;
  }

  getExpectedDateTime(): string {
    const slot = this.selectedSlot();
    if (slot) {
      const date = new Date(`${slot.date}T${slot.start_time}`);
      return date.toLocaleString(this.t.currentLanguage(), {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return this.t.instant('newRequest.notSelectedSystemAssign');
  }

  private async showToast(message: string, color: string = 'primary'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color
    });
    toast.present();
  }
}

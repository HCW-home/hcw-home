import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ConsultationService, BookingRequest } from '../../services/consultation.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-booking',
  templateUrl: './booking.page.html',
  styleUrls: ['./booking.page.scss'],
})
export class BookingPage implements OnInit {
  bookingForm: FormGroup;
  isSubmitting = false;
  currentStep = 1;
  totalSteps = 3;
  selectedDates: Date[] = [];
  bookingSuccess = false;

  constructor(
    private formBuilder: FormBuilder,
    private consultationService: ConsultationService,
    private authService: AuthService,
    private router: Router,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {
    this.bookingForm = this.formBuilder.group({
      // Step 1: Date selection
      preferredDate: [null, Validators.required],
      preferredTime: ['', Validators.required],
      
      // Step 2: Contact information
      phoneNumber: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      
      // Step 3: Additional information
      notes: [''],
      symptoms: [''],
      medicalHistory: ['']
    });
  }

  ngOnInit() {}

  nextStep() {
    if (this.currentStep === 1) {
      if (!this.bookingForm.get('preferredDate')?.value || !this.bookingForm.get('preferredTime')?.value) {
        this.showToast('Please select both date and time', 'warning');
        return;
      }
      
      // Add selected date and time to the array
      const date = new Date(this.bookingForm.get('preferredDate')?.value);
      const [hours, minutes] = this.bookingForm.get('preferredTime')?.value.split(':');
      date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
      
      // Check if this date is already selected
      if (!this.selectedDates.some(d => d.getTime() === date.getTime())) {
        this.selectedDates.push(date);
      }
    }
    
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  removeDate(index: number) {
    this.selectedDates.splice(index, 1);
  }

  async submitBooking() {
    if (this.bookingForm.invalid || this.isSubmitting || this.selectedDates.length === 0) {
      this.showToast('Please fill in all required fields', 'warning');
      return;
    }

    this.isSubmitting = true;
    const loading = await this.loadingController.create({
      message: 'Submitting booking request...',
      spinner: 'circles'
    });
    await loading.present();

    const user = this.authService.getCurrentUser();
    if (!user) {
      loading.dismiss();
      this.showToast('You must be logged in to book a consultation', 'danger');
      this.router.navigate(['/login']);
      return;
    }

    // Create booking request
    const bookingRequest: BookingRequest = {
      patientId: user.id,
      preferredDate: this.selectedDates.map(date => date.toISOString()),
      notes: `Phone: ${this.bookingForm.get('phoneNumber')?.value}\nSymptoms: ${this.bookingForm.get('symptoms')?.value || 'None'}\nMedical History: ${this.bookingForm.get('medicalHistory')?.value || 'None'}\nAdditional Notes: ${this.bookingForm.get('notes')?.value || 'None'}`
    };

    this.consultationService.createBookingRequest(bookingRequest).subscribe({
      next: () => {
        loading.dismiss();
        this.isSubmitting = false;
        this.bookingSuccess = true;
      },
      error: (error) => {
        loading.dismiss();
        this.isSubmitting = false;
        this.showToast('Failed to submit booking request. Please try again.', 'danger');
      }
    });
  }

  goToDashboard() {
    this.router.navigate(['/tabs/dashboard']);
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color
    });
    toast.present();
  }

  formatDate(date: Date): string {
    return date.toLocaleString();
  }
}

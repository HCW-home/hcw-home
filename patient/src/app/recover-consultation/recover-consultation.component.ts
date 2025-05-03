import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';

@Component({
  selector: 'app-recover-consultation',
  templateUrl: './recover-consultation.component.html',
  styleUrls: ['./recover-consultation.component.scss']
})
export class RecoverConsultationComponent {
  recoveryForm: FormGroup;
  isSubmitting = false;
  feedbackMessage = '';
  showFeedback = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private router: Router
  ) {
    this.recoveryForm = this.fb.group({
      contactInfo: ['', [
        Validators.required,
        Validators.pattern(/^\+?[1-9]\d{1,14}$/)
      ]]
    });
  }

  onSubmit() {
    if (this.recoveryForm.invalid || this.isSubmitting) {
      return;
    }

    const contactInfo = this.recoveryForm.get('contactInfo')?.value?.trim();
    if (!contactInfo) {
      return;
    }

    this.isSubmitting = true;
    this.showFeedback = false;
    
    // Always use phone number field in the payload
    const payload = { phoneNumber: contactInfo };

    // Send recovery request to backend
    this.http.post(`${environment.apiUrl}/recover-consultation`, payload)
      .subscribe({
        next: (response: any) => {
          this.isSubmitting = false;
          this.showFeedback = true;
          this.feedbackMessage = response.message || "If an active consultation exists, you'll receive a link shortly via SMS.";
          this.recoveryForm.reset();
        },
        error: (error) => {
          this.isSubmitting = false;
          this.showFeedback = true;
          this.feedbackMessage = "Something went wrong. Please try again later.";
          console.error('Error recovering consultation:', error);
        }
      });
  }
} 
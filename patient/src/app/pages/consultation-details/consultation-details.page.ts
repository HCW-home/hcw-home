import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController, AlertController } from '@ionic/angular';
import { ConsultationService, Consultation } from '../../services/consultation.service';
import { FeedbackService, CreateFeedbackDto } from '../../services/feedback.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-consultation-details',
  templateUrl: './consultation-details.page.html',
  styleUrls: ['./consultation-details.page.scss'],
})
export class ConsultationDetailsPage implements OnInit {
  consultationId: number;
  consultation: Consultation | null = null;
  isLoading = false;
  error: string | null = null;
  showFeedbackForm = false;
  feedbackForm: FormGroup;
  hasFeedback = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private consultationService: ConsultationService,
    private feedbackService: FeedbackService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private formBuilder: FormBuilder
  ) {
    this.consultationId = +this.route.snapshot.paramMap.get('id')!;
    this.feedbackForm = this.formBuilder.group({
      rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
      comments: ['', Validators.maxLength(500)]
    });
  }

  ngOnInit() {
    this.loadConsultation();
  }

  async loadConsultation() {
    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: 'Loading consultation details...',
      spinner: 'circles'
    });
    await loading.present();

    this.consultationService.getConsultation(this.consultationId).subscribe({
      next: (consultation) => {
        this.consultation = consultation;
        this.hasFeedback = !!consultation.feedback;
        this.isLoading = false;
        loading.dismiss();
      },
      error: async (error) => {
        this.error = 'Failed to load consultation details. Please try again.';
        this.isLoading = false;
        loading.dismiss();
        
        const toast = await this.toastController.create({
          message: this.error,
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        toast.present();
      }
    });
  }

  async joinConsultation() {
    if (!this.consultation) return;

    const loading = await this.loadingController.create({
      message: 'Preparing consultation room...',
      spinner: 'circles'
    });
    await loading.present();

    this.consultationService.generateJoinLink(this.consultation.id).subscribe({
      next: (response) => {
        loading.dismiss();
        window.open(response.joinLink, '_blank');
        
        // Update consultation status to ACTIVE if not already
        if (this.consultation?.status !== 'ACTIVE') {
          this.consultationService.updateConsultationStatus(this.consultation!.id, 'ACTIVE').subscribe({
            next: () => {
              this.loadConsultation(); // Refresh the details
            }
          });
        }
      },
      error: async (error) => {
        loading.dismiss();
        const toast = await this.toastController.create({
          message: 'Failed to join consultation. Please try again.',
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        toast.present();
      }
    });
  }

  async cancelConsultation() {
    if (!this.consultation) return;

    const alert = await this.alertController.create({
      header: 'Cancel Consultation',
      message: 'Are you sure you want to cancel this consultation?',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Yes, Cancel',
          handler: async () => {
            const loading = await this.loadingController.create({
              message: 'Cancelling consultation...',
              spinner: 'circles'
            });
            await loading.present();

            this.consultationService.updateConsultationStatus(this.consultation!.id, 'CANCELLED').subscribe({
              next: () => {
                loading.dismiss();
                this.loadConsultation(); // Refresh the details
                this.showToast('Consultation cancelled successfully', 'success');
              },
              error: (error) => {
                loading.dismiss();
                this.showToast('Failed to cancel consultation. Please try again.', 'danger');
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  toggleFeedbackForm() {
    this.showFeedbackForm = !this.showFeedbackForm;
  }

  async submitFeedback() {
    if (this.feedbackForm.invalid || !this.consultation) {
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Submitting feedback...',
      spinner: 'circles'
    });
    await loading.present();

    const feedbackData: CreateFeedbackDto = {
      consultationId: this.consultation.id,
      rating: this.feedbackForm.get('rating')?.value,
      comments: this.feedbackForm.get('comments')?.value
    };

    this.feedbackService.createFeedback(feedbackData).subscribe({
      next: () => {
        loading.dismiss();
        this.showFeedbackForm = false;
        this.loadConsultation(); // Refresh to show feedback
        this.showToast('Thank you for your feedback!', 'success');
      },
      error: (error) => {
        loading.dismiss();
        this.showToast('Failed to submit feedback. Please try again.', 'danger');
      }
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'SCHEDULED':
      case 'CONFIRMED':
        return 'primary';
      case 'ACTIVE':
        return 'success';
      case 'COMPLETED':
        return 'tertiary';
      case 'MISSED':
      case 'CANCELLED':
        return 'danger';
      default:
        return 'medium';
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  goBack() {
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
}

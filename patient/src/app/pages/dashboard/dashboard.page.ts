import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ConsultationService, Consultation } from '../../services/consultation.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage implements OnInit {
  upcomingConsultations: Consultation[] = [];
  activeConsultations: Consultation[] = [];
  pastConsultations: Consultation[] = [];
  isLoading = false;
  error: string | null = null;

  constructor(
    private consultationService: ConsultationService,
    private authService: AuthService,
    private router: Router,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loadConsultations();
  }

  ionViewWillEnter() {
    this.loadConsultations();
  }

  async loadConsultations() {
    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: 'Loading consultations...',
      spinner: 'circles'
    });
    await loading.present();

    this.consultationService.getConsultations().subscribe({
      next: (consultations) => {
        this.upcomingConsultations = this.consultationService.getUpcomingConsultations(consultations);
        this.activeConsultations = this.consultationService.getActiveConsultations(consultations);
        this.pastConsultations = this.consultationService.getPastConsultations(consultations);
        this.isLoading = false;
        loading.dismiss();
      },
      error: async (error) => {
        this.error = 'Failed to load consultations. Please try again.';
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

  async joinConsultation(consultation: Consultation) {
    const loading = await this.loadingController.create({
      message: 'Preparing consultation room...',
      spinner: 'circles'
    });
    await loading.present();

    this.consultationService.generateJoinLink(consultation.id).subscribe({
      next: (response) => {
        loading.dismiss();
        window.open(response.joinLink, '_blank');
        
        // Update consultation status to ACTIVE if not already
        if (consultation.status !== 'ACTIVE') {
          this.consultationService.updateConsultationStatus(consultation.id, 'ACTIVE').subscribe({
            next: () => {
              this.loadConsultations(); // Refresh the list
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

  bookConsultation() {
    this.router.navigate(['/tabs/booking']);
  }

  viewConsultationDetails(consultation: Consultation) {
    this.router.navigate(['/consultation-details', consultation.id]);
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

  doRefresh(event: any) {
    this.loadConsultations();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }
}

import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ConsultationService, Consultation } from '../../services/consultation.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
})
export class HistoryPage implements OnInit {
  pastConsultations: Consultation[] = [];
  isLoading = false;
  error: string | null = null;
  
  constructor(
    private consultationService: ConsultationService,
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
      message: 'Loading consultation history...',
      spinner: 'circles'
    });
    await loading.present();

    this.consultationService.getConsultations().subscribe({
      next: (consultations) => {
        this.pastConsultations = this.consultationService.getPastConsultations(consultations);
        this.isLoading = false;
        loading.dismiss();
      },
      error: async (error) => {
        this.error = 'Failed to load consultation history. Please try again.';
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

  viewConsultationDetails(consultation: Consultation) {
    this.router.navigate(['/consultation-details', consultation.id]);
  }

  getStatusColor(status: string): string {
    switch (status) {
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

import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonRefresher, IonRefresherContent, IonSpinner, IonIcon, IonButton } from '@ionic/angular/standalone';
import { ConsultationService } from '../services/consultation.service';
import { Consultation } from '../models/consultation.model';
import { ConsultationCardComponent } from '../components/consultation-card/consultation-card.component';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { videocamOffOutline, helpCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonRefresher, 
    IonRefresherContent, 
    IonSpinner,
    IonIcon,
    IonButton,
    ConsultationCardComponent,
    CommonModule
  ],
})
export class Tab1Page implements OnInit {
  activeConsultations: Consultation[] = [];
  // Temporary hardcoded patient ID - in a real app this would come from authentication
  patientId = 1;
  isLoading = false;

  constructor(
    private consultationService: ConsultationService,
    private router: Router
  ) {
    addIcons({
      videocamOffOutline,
      helpCircleOutline
    });
  }

  ngOnInit() {
    this.loadConsultations();
  }

  loadConsultations(event?: any) {
    this.isLoading = true;
    this.consultationService.getActiveConsultations(this.patientId).subscribe({
      next: (response) => {
        this.activeConsultations = response.consultations;
        this.isLoading = false;
        if (event) {
          event.target.complete();
        }
      },
      error: (error) => {
        console.error('Error loading consultations', error);
        this.isLoading = false;
        if (event) {
          event.target.complete();
        }
      }
    });
  }

  handleRefresh(event: any) {
    this.loadConsultations(event);
  }

  joinConsultation(consultationId: number) {
    this.consultationService.joinConsultation(consultationId, this.patientId).subscribe({
      next: (response) => {
        if (response.success) {
          this.router.navigate(['/consultation', consultationId]);
        }
      },
      error: (error) => {
        console.error('Error joining consultation', error);
      }
    });
  }
}

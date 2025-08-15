import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationCardComponent } from '../components/consultations-card/consultations-card.component';
import { InviteFormComponent } from '../components/invite-form/invite-form.component';
import { RoutePaths } from '../constants/route-paths.enum';
import { ConsultationService, CreatePatientConsultationRequest } from '../services/consultations/consultation.service';
import { ConsultationWithPatient } from '../dtos';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ConsultationCardComponent, InviteFormComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  waitingConsultations = signal<ConsultationWithPatient[]>([]);
  openConsultations = signal<ConsultationWithPatient[]>([]);
  isInviting = signal(false);
  isLoading = signal(false); 

  constructor(private consultationService: ConsultationService) {}

  ngOnInit(): void {
    this.loadConsultations();
  }

  private loadConsultations(): void {
    this.consultationService
      .getWaitingConsultations()
      .subscribe({
        next: (data) => {
          console.log('Waiting consultations received:', data);
          this.waitingConsultations.set(data);
        },
        error: (error) => {
          console.error('Error fetching waiting consultations:', error);
        }
      });
    
    // Load open consultations
    this.consultationService
      .getOpenConsultations()
      .subscribe({
        next: (data) => {
          console.log('Open consultations received:', data);
          this.openConsultations.set(data);
        },
        error: (error) => {
          console.error('Error fetching open consultations:', error);
        }
      });
  }

  cards = computed(() => {
    const cards = [
      {
        title: 'WAITING ROOM',
        description: 'Consultations waiting to be attended',
        consultations: this.waitingConsultations(),
        routerLink: RoutePaths.WaitingRoom,
        showInvite: true,
      },
      {
        title: 'OPEN CONSULTATIONS',
        description: 'Consultations in progress',
        consultations: this.openConsultations(),
        routerLink: RoutePaths.OpenConsultations,
        showInvite: false,
      },
    ];
    console.log('Cards computed:', cards);
    return cards;
  });

  trackByTitle(_idx: number, card: { title: string }): string {
    return card.title;
  }

onInviteSubmit(formData: CreatePatientConsultationRequest) {
    console.log('✅ Form submitted with data:', formData);
    
    this.isLoading.set(true);
    
    this.consultationService.createPatientAndConsultation(formData)
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          if (response.data && response.data.success) {
            const { patient, consultation } = response.data.data;
            
            if (patient.isNewPatient) {
              alert(`New patient "${patient.firstName} ${patient.lastName}" created and consultation #${consultation.id} scheduled!`);
            } else {
              alert(`Consultation #${consultation.id} scheduled for existing patient "${patient.firstName} ${patient.lastName}"!`);
            }
            
            this.closeInvite();
            
            this.loadConsultations();
            
          } else {
            alert('Failed to create consultation: ');
          }
        },
        error: (error) => {
          this.isLoading.set(false);
          console.error('API Error:', error);
          
          let errorMessage = 'Failed to create patient and consultation';
          
          if (error.error?.message) {
            errorMessage = error.error.message;
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          alert('Error: ' + errorMessage);
          
        }
      });
  }

  openInviteSelector() {
    this.isInviting.set(true);
  }

  closeInvite() {
    this.isInviting.set(false);
  }
}
import { FormsModule } from '@angular/forms';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { 
  ToastController,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonContent, 
  IonItem, IonLabel, IonButton,
  IonCol,
  IonRow,
  IonGrid,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  paperPlaneOutline, 
  createOutline, 
  trashOutline 
} from 'ionicons/icons';

import { 
  createConsultationService, 
  CreateConsultationDto 
} from 'src/app/services/createConsultation.service';
import { Speciality, SpecialityService } from 'src/app/services/getSpeciality.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-tab2',
  templateUrl: 'consultation-request.page.html',
  styleUrls: ['consultation-request.page.scss'],
  standalone: true,
  imports: [
    HeaderComponent,
    IonCol,
    IonRow,
    IonGrid,
    CommonModule,
    FormsModule,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonItem,
    IonLabel,
    IonContent,
    IonIcon,
  ],
})
export class ConsultationRequestPage implements OnInit {
  specialities: Speciality[] = [];

  consultation: Partial<{
    selectedSpecialtyId: number;
    symptoms: string;
  }> = {};

  loading = false;

  constructor(
    private router: Router, 
    private toastController: ToastController,
    private consultationRequestService: createConsultationService,
    private specialityService: SpecialityService,
    private authService: AuthService,
  ) {
    addIcons({
      'paper-plane-outline': paperPlaneOutline,
      'create-outline': createOutline,
      'trash-outline': trashOutline
    }); 
  }
  patientId!: number;
  ngOnInit() {
    const user = this.authService.getCurrentUser();
    if (typeof user?.id === 'number') {
      this.patientId = user.id;
    } else {
      console.error('No patient ID found for the current user');
      return;
    }
    this.loadSpecialities();
  }


  submitRequest() {
    if (!this.consultation.selectedSpecialtyId) {
      this.showDetailsfillError("Please select a specialty");
      return;
    }

    const dto: CreateConsultationDto = {
      patientId: this.patientId,
      specialityId: this.consultation.selectedSpecialtyId,
      symptoms: this.consultation.symptoms || '',
    };
    const UserId = this.patientId;

    this.consultationRequestService.createConsultation(dto, UserId).subscribe({
      next: () => {
        this.showSuccessToast('Consultation created');
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 2000);
      },
      error: (err) => {
        console.error('API error:', err);
        this.showDetailsfillError('Failed to create consultation');
      }
    });
  }

  loadSpecialities() {
    this.loading = true;

    this.specialityService.getAllSpecialities().subscribe({
      next: (data) => {
        this.specialities = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading specialities:', error);
        this.showDetailsfillError('Failed to load specialities');
        this.loading = false;
      }
    });
  }

  // Toasts
  async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color: 'success',
      position: 'bottom'
    });
    await toast.present();
  }

  async showDetailsfillError(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color: 'danger',
      position: 'bottom'
    });
    await toast.present();
  }
}
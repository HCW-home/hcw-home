import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { 
  IonInput,
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


interface Consultation {
  id: number;
  patientName: string;
  age: number;
  groupOrSpecialty: string;
  symptoms: string;
  status: 'draft' | 'assigned' | 'completed';
  createdAt: Date;
}

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
    IonInput,
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
export class ConsultationRequestPage {
  groupsOrSpecialties = [
    'General Medicine',
    'Pediatrics',
    'Dermatology',
    'Cardiology',
    'Orthopedics',
    'Neurology',
    'Gynecology'
  ];
  
  consultation: Partial<Consultation> = {
    status: 'draft'
  };

  draftConsultations: Consultation[] = [];
  nextId = 1;
  
  constructor(private router: Router, private toastController: ToastController) {
    // Add Ionicons
    addIcons({
      'paper-plane-outline': paperPlaneOutline,
      'create-outline': createOutline,
      'trash-outline': trashOutline
    });
    
  }
  
  submitRequest() {
    if (!this.consultation.patientName || !this.consultation.age || !this.consultation.groupOrSpecialty) {
      // Show validation error
      this.showDetailsfillError("Please Fill all mendatory details");
      return;
    }
    
    const newConsultation: Consultation = {
      id: this.nextId++,
      patientName: this.consultation.patientName || '',
      age: this.consultation.age || 0,
      groupOrSpecialty: this.consultation.groupOrSpecialty || '',
      symptoms: this.consultation.symptoms || '',
      status: 'draft',
      createdAt: new Date()
    };

    this.draftConsultations.unshift(newConsultation); // Add to beginning of array
    // Api call to save deaft consultation into database

    // Show success message
    this.showSuccessToast('Consultation request saved successfully!');
    
    // Reset form
    this.consultation = {
      status: 'draft'
    };
    this.router.navigate(['/patient-dashboard']);
  }
  
  // Helper methods
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

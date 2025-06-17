import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { 
  IonContent, 
  IonCard, IonCardHeader, IonCardTitle, IonCardContent, 
  IonList, IonItem, IonLabel, IonButton, IonIcon, 
  IonChip, IonText, AlertController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  videocamOutline, starOutline,
  calendarOutline, checkmarkCircle 
} from 'ionicons/icons';

import { Router } from '@angular/router';
interface Consultation {
  id: number;
  doctorName: string;
  specialty: string;
  dateTime: Date;
  status: 'Open' | 'Waiting' | 'Completed' | 'Upcoming';
  duration?: number;
  feedbackSubmitted?: boolean;
  timeUntil?: string;
}

@Component({
  selector: 'card-component',
  templateUrl: './card-component.component.html',
  styleUrls: ['./card-component.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, 
    IonCard, 
    IonCardHeader, 
    IonCardTitle, 
    IonCardContent, 
    IonList, 
    IonItem, 
    IonLabel, 
    IonButton, 
    IonIcon, 
    IonChip, 
    IonText,
  ],
})

export class CardComponentComponent {

  constructor(private router: Router ,private alertController: AlertController, private toastController: ToastController) {
    addIcons({
      videocamOutline, 
      starOutline, 
      calendarOutline,
      checkmarkCircle
    });
  }
    @Input() activeConsultations: Consultation[] = [];
    @Input() completedConsultations: Consultation[] = [];
    @Input() upcomingConsultations: Consultation[] = [];

  // on clicking this button patient navigate
  async joinConsultation(consultationId: number) {
    const toast = await this.toastController.create({
      message: 'Joining video consultation...',
      duration: 2000,
      color: 'success'
    });
    toast.present();
    // In a real app, this would navigate to a video call page or launch a video SDK
  }

  // we have to provide it after consultation ends
  async provideFeedback(consultationId: number) {
    const alert = await this.alertController.create({
      header: 'Rate your consultation',
      inputs: [
        {
          name: 'rating',
          placeholder: 'Choose a rating from 1-5'
        },
        {
          name: 'comment',
          type: 'textarea',
          placeholder: 'Additional comments (optional)'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Submit',
          handler: (data) => {
            // Update the consultation object to mark feedback as submitted
            const consultation = this.completedConsultations.find(c => c.id === consultationId);
            if (consultation) {
              consultation.feedbackSubmitted = true;
            }
            
            this.presentToast('Feedback submitted successfully!');
          }
        }
      ]
    });

    await alert.present();
  }

  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      color: 'success'
    });
    toast.present();
  }
   async viewSummary(consultationId: number) {
    const consultation = this.completedConsultations.find(c => c.id === consultationId);

    if (consultation) {
      const alert = await this.alertController.create({
        header: 'Consultation Summary',
        subHeader: `${consultation.doctorName} - ${consultation.specialty}`,
        message: `
          <p><strong>Date:</strong> ${new Date(consultation.dateTime).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${new Date(consultation.dateTime).toLocaleTimeString()}</p>
          <p><strong>Duration:</strong> ${consultation.duration} minutes</p>
          <p><strong>Notes:</strong> Follow-up in 30 days. Prescribed medication reviewed. Overall health improving.</p>
        `,
        buttons: ['Close']
      });

      await alert.present();
    }
  }
  goToConsultationRequest() {
    this.router.navigate(['/consultation-request']);
  }
}
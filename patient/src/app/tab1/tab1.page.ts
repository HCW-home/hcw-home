import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, IonToolbar, IonTitle, IonContent, 
  IonCard, IonCardHeader, IonCardTitle, IonCardContent, 
  IonList, IonItem, IonLabel, IonButton, IonIcon, 
  IonChip, IonText, AlertController, ToastController, IonAvatar
} from '@ionic/angular/standalone';
import { DatePipe } from '@angular/common';
import { addIcons } from 'ionicons';
import { 
  videocamOutline, starOutline, documentTextOutline, 
  closeCircleOutline, calendarOutline, checkmarkCircle 
} from 'ionicons/icons';

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
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, 
    IonAvatar,
    IonToolbar, 
    IonTitle, 
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
    DatePipe
  ],
})
export class Tab1Page {
  activeConsultations: Consultation[] = [];
  completedConsultations: Consultation[] = [];
  upcomingConsultations: Consultation[] = [];

  constructor(private alertController: AlertController, private toastController: ToastController) {
    // Add icons to be used in the template
    addIcons({
      videocamOutline, 
      starOutline, 
      documentTextOutline, 
      closeCircleOutline, 
      calendarOutline,
      checkmarkCircle
    });
    
    // Load dummy data
    this.loadDummyData();
  }

  loadDummyData() {
    // Active consultations
    this.activeConsultations = [
      {
        id: 1,
        doctorName: 'Dr. Sarah Johnson',
        specialty: 'Cardiology',
        dateTime: new Date(),
        status: 'Open'
      },
      {
        id: 2,
        doctorName: 'Dr. Michael Chen',
        specialty: 'Dermatology',
        dateTime: new Date(Date.now() - 10 * 60000), // 10 minutes ago
        status: 'Waiting'
      }
    ];

    // Completed consultations
    this.completedConsultations = [
      {
        id: 3,
        doctorName: 'Dr. Emily Rodriguez',
        specialty: 'General Practitioner',
        dateTime: new Date(Date.now() - 2 * 24 * 3600000), // 2 days ago
        status: 'Completed',
        duration: 15,
        feedbackSubmitted: true
      },
      {
        id: 4,
        doctorName: 'Dr. James Wilson',
        specialty: 'Orthopedics',
        dateTime: new Date(Date.now() - 7 * 24 * 3600000), // 7 days ago
        status: 'Completed',
        duration: 30,
        feedbackSubmitted: false
      },
      {
        id: 5,
        doctorName: 'Dr. Lisa Thompson',
        specialty: 'Psychiatry',
        dateTime: new Date(Date.now() - 14 * 24 * 3600000), // 14 days ago
        status: 'Completed',
        duration: 45,
        feedbackSubmitted: true
      }
    ];

    // Upcoming consultations
    this.upcomingConsultations = [
      {
        id: 6,
        doctorName: 'Dr. Robert Brown',
        specialty: 'Neurology',
        dateTime: new Date(Date.now() + 2 * 24 * 3600000), // In 2 days
        status: 'Upcoming',
        timeUntil: '2 days'
      },
      {
        id: 7,
        doctorName: 'Dr. Anna Kim',
        specialty: 'Ophthalmology',
        dateTime: new Date(Date.now() + 7 * 24 * 3600000), // In 7 days
        status: 'Upcoming',
        timeUntil: '1 week'
      }
    ];
  }

  async joinConsultation(consultationId: number) {
    const toast = await this.toastController.create({
      message: 'Joining video consultation...',
      duration: 2000,
      color: 'success'
    });
    toast.present();
    // In a real app, this would navigate to a video call page or launch a video SDK
  }

  async provideFeedback(consultationId: number) {
    const alert = await this.alertController.create({
      header: 'Rate your consultation',
      inputs: [
        {
          name: 'rating',
          // type: 'rating',
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

  async cancelConsultation(consultationId: number) {
    const alert = await this.alertController.create({
      header: 'Cancel Consultation',
      message: 'Are you sure you want to cancel this consultation?',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Yes',
          handler: () => {
            // Remove the consultation from the list
            this.upcomingConsultations = this.upcomingConsultations.filter(c => c.id !== consultationId);
            this.presentToast('Consultation cancelled successfully');
          }
        }
      ]
    });

    await alert.present();
  }

  async rescheduleConsultation(consultationId: number) {
    // In a real app, this would open a date/time picker
    const toast = await this.toastController.create({
      message: 'Opening scheduler...',
      duration: 2000
    });
    toast.present();
  }

  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      color: 'success'
    });
    toast.present();
  }
}
import { CardComponentComponent } from 'src/app/components/card-component/card-component.component';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
   AlertController, ToastController,
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
  selector: 'app-dashboard',
  templateUrl: './patient-dashboard.page.html',
  styleUrls: ['./patient-dashboard.page.scss'],
  standalone: true,
  imports: [
    CardComponentComponent,
    HeaderComponent,
    CommonModule,
  ],
})

export class PatientDashboard {
  consultations: Consultation[] = [];
  activeConsultations: Consultation[] = [];
  completedConsultations: Consultation[] = [];
  upcomingConsultations: Consultation[] = [];

  constructor(private router: Router ,private alertController: AlertController, private toastController: ToastController) {
    // Add icons to be used in the template
    addIcons({
      videocamOutline, 
      starOutline, 
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

  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      color: 'success'
    });
    toast.present();
  }

  goToConsultationRequest() {
    this.router.navigate(['/consultation-request']);
  }
}
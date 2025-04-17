import { Component } from '@angular/core';
import { 
  IonHeader, IonToolbar, IonTitle, IonContent, 
  IonList, IonListHeader, IonLabel, IonCard, 
  IonCardContent, IonItem, IonBadge, IonButton, 
  IonIcon 
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  videocam, time, checkmarkCircle, create, 
  calendarOutline, star, alertCircle, medical,
  timeOutline, checkmarkDoneOutline
} from 'ionicons/icons';
import { ConsultationService } from '../services/consultation.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatePipe } from '@angular/common';



@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, 
    IonList, IonListHeader, IonLabel, IonCard, 
    IonCardContent, IonItem, IonBadge, IonButton, 
    IonIcon,
    CommonModule,
    DatePipe
  ],
  standalone: true
})
export class Tab3Page {
  activeConsultations: any[] = [];
  completedConsultations: any[] = [];

  constructor(
    private consultationService: ConsultationService,
    private router: Router
  ) {
    addIcons({ 
      videocam, time, checkmarkCircle, create, 
      calendarOutline, star, alertCircle, medical,
      timeOutline, checkmarkDoneOutline
    });
    this.loadConsultations();
  }

  async loadConsultations() {
    try {
      // In a real app, you would get this from your API
      const consultations = await this.consultationService.getConsultations();
      
      if (consultations) {
        const now = new Date();
        this.activeConsultations = consultations.filter(c => 
          ['Active', 'Waiting'].includes(c.status)
        ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        this.completedConsultations = consultations.filter(c => 
          c.status === 'Completed'
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
    } catch (error) {
      console.error('Error loading consultations:', error);
    }
  }

  getStatusColor(status: string): string {
    switch(status) {
      case 'Active': return 'primary';
      case 'Waiting': return 'warning';
      case 'Completed': return 'success';
      default: return 'medium';
    }
  }

  getStatusIcon(status: string): string {
    switch(status) {
      case 'Active': return 'medical';
      case 'Waiting': return 'time';
      case 'Completed': return 'checkmark-circle';
      default: return 'alert-circle';
    }
  }

  joinConsultation(consultationId: string) {
    // Implement join functionality
    this.consultationService.joinConsultation(consultationId);
  }


  leaveFeedback(consultationId: string) {
    this.router.navigate(['/feedback', consultationId]);
  }
}
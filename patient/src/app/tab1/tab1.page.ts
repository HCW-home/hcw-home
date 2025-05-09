import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ConsultationService, Consultation } from '../services/consultation.service';
import { ReviewModalComponent } from '../components/review-modal/review-modal.component';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  waterOutline,
  timeOutline,
  medicalOutline,
  videocamOutline,
  starOutline,
  checkmarkCircleOutline,
  hourglassOutline,
  checkboxOutline,
  closeCircleOutline,
  businessOutline,
  homeOutline,
  locationOutline,
  walletOutline,
  fitnessOutline,
  addCircleOutline
} from 'ionicons/icons';

interface UserProfile {
  name: string;
  age: number;
  bloodGroup: string;
  lastVisit: Date;
  avatar?: string;
}

@Component({
  selector: 'app-tab1',
  standalone: true,
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    FormsModule
  ],
})
export class Tab1Page implements OnInit {
  userProfile: UserProfile = {
    name: 'John Doe',
    age: 35,
    bloodGroup: 'A+',
    lastVisit: new Date('2024-01-15')
  };

  selectedSegment: string = 'upcoming';
  upcomingConsultations: any[] = [];
  pastConsultations: any[] = [];
  private timerInterval: any;
  searchTerm: string = '';
  filteredConsultations: Consultation[] = [];

  constructor(
    private consultationService: ConsultationService,
    private modalController: ModalController
  ) {
    // Register icons
    addIcons({
      calendarOutline,
      waterOutline,
      timeOutline,
      medicalOutline,
      videocamOutline,
      starOutline,
      checkmarkCircleOutline,
      hourglassOutline,
      checkboxOutline,
      closeCircleOutline,
      businessOutline,
      homeOutline,
      locationOutline,
      walletOutline,
      fitnessOutline,
      addCircleOutline
    });
  }

  ngOnInit() {
    this.loadConsultations();
    this.startTimer();
  }

  ionViewWillEnter() {
    // Refresh consultations whenever the page is entered
    this.loadConsultations();
  }

  ionViewWillLeave() {
    // Clear the timer when leaving the page
    clearInterval(this.timerInterval);
  }

  private loadConsultations() {
    const all = this.consultationService.getConsultations();
    const now = new Date();

    this.upcomingConsultations = all.filter(c => c.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    this.pastConsultations = all.filter(c => c.date < now)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    this.filteredConsultations = this.selectedSegment === 'upcoming'
      ? this.upcomingConsultations
      : this.pastConsultations;
  }

  private startTimer() {
    this.timerInterval = setInterval(() => {
      this.loadConsultations(); // Refresh consultations to update timers
    }, 1000); // Update every second
  }

  getRemainingTime(consultationDate: Date): string {
    const now = new Date().getTime();
    const timeDiff = new Date(consultationDate).getTime() - now;

    if (timeDiff <= 0) {
      return 'Started';
    }

    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  getBadgeColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'success';
      case 'pending':
      case 'awaiting':
        return 'warning';
      case 'cancelled':
        return 'danger';
      default:
        return 'medium';
    }
  }

  async joinConsultation(consultation: Consultation) {
    // Implement your video call logic here
    console.log('Joining consultation:', consultation);
    // Example: window.open(consultation.meetingUrl);
  }

  async openReviewModal(consultation: Consultation) {
    // Create and present a modal for reviewing
    const modal = await this.modalController.create({
      component: ReviewModalComponent,
      componentProps: {
        consultation: consultation
      }
    });

    modal.onDidDismiss().then((result) => {
      if (result.data) {
        // Update the consultation with review data
        consultation.reviewed = true;
        consultation.rating = result.data.rating;
        consultation.reviewComment = result.data.comment;
        // Update in service if needed
        this.consultationService.updateConsultation(consultation);
      }
    });

    return await modal.present();
  }

  searchConsultations(event: any) {
    const searchTerm = event.target.value.toLowerCase();
    this.filteredConsultations = this.selectedSegment === 'upcoming'
      ? this.upcomingConsultations
      : this.pastConsultations;

    if (searchTerm) {
      this.filteredConsultations = this.filteredConsultations.filter(consultation =>
        consultation.practitioner.name.toLowerCase().includes(searchTerm) ||
        consultation.practitioner.specialty.toLowerCase().includes(searchTerm) ||
        consultation.type.toLowerCase().includes(searchTerm) || consultation.symptoms.some(symptom => symptom.toLowerCase().includes(searchTerm))
      );
    }
  }

  getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'confirmed': return 'checkmark-circle-outline';
      case 'pending': return 'hourglass-outline';
      case 'completed': return 'checkbox-outline';
      case 'cancelled': return 'close-circle-outline';
      default: return 'help-circle-outline';
    }
  }

  getLocationIcon(location: string): string {
    switch (location) {
      case 'Video Call': return 'videocam-outline';
      case 'Hospital': return 'business-outline';
      case 'Home Visit': return 'home-outline';
      default: return 'location-outline';
    }
  }

  segmentChanged() {
    this.searchTerm = '';
    this.filteredConsultations = this.selectedSegment === 'upcoming'
      ? this.upcomingConsultations
      : this.pastConsultations;
  }
}

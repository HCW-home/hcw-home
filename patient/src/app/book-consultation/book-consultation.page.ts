import { Component, OnInit } from '@angular/core';
import { AlertController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ConsultationService, Consultation } from '../services/consultation.service';

@Component({
  selector: 'app-book-consultation',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule],
  templateUrl: './book-consultation.page.html',
  styleUrls: ['./book-consultation.page.scss'],
})
export class BookConsultationPage implements OnInit {
  consultation: Partial<Consultation> = {
    contact: '',
    date: new Date(),
    timeSlot: '',
    notes: '',
    status: 'Pending',
    practitioner: {
      name: 'Dr. Dre',
      specialty: 'Physicist',
      avatar: 'https://ui-avatars.com/api/?name=Dr+Dre&background=0D8ABC&color=fff'
    },
    type: 'Initial',
    symptoms: [],
    location: 'Video Call',
    price: 100
  };

  consultationTypes = ['Initial', 'Follow-up', 'Regular', 'Emergency'];
  locationTypes = ['Video Call', 'Hospital', 'Home Visit'];
  commonSymptoms = [
    'Fever', 'Cough', 'Headache', 'Body Pain',
    'Sore Throat', 'Chest Pain', 'Breathing Difficulty',
    'Nausea', 'Fatigue', 'Other'
  ];

  minDate: string;
  maxDate: string;
  today: string;

  constructor(
    private alertCtrl: AlertController,
    private consultationService: ConsultationService,
    private router: Router
  ) {
    // Set today's date
    const today = new Date();
    this.today = today.toISOString();

    // Set minimum date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Reset time to start of day
    this.minDate = tomorrow.toISOString();

    // Set maximum date to 30 days from tomorrow
    const maxDate = new Date(tomorrow);
    maxDate.setDate(maxDate.getDate() + 30);
    this.maxDate = maxDate.toISOString();

    // Initialize consultation date to tomorrow
    this.consultation = {
      ...this.consultation,
      date: tomorrow
    };
  }

  ngOnInit() {
    // Initialize with default values if needed
  }

  async onSubmit() {
    if (!this.isValidConsultation()) {
      const alert = await this.alertCtrl.create({
        header: 'Invalid Input',
        message: 'Please fill in all required fields',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    const dateISO = this.consultation.date;
    const timePart = new Date(this.consultation.timeSlot as string);

    const combinedDateTime = new Date(dateISO as Date);
    combinedDateTime.setHours(timePart.getHours());
    combinedDateTime.setMinutes(timePart.getMinutes());

    const newConsultation: Consultation = {
      id: Date.now().toString(),
      ...this.consultation,
      date: combinedDateTime,
      status: 'Pending',
      price: this.calculatePrice()
    } as Consultation;

    this.consultationService.addConsultation(newConsultation);

    const alert = await this.alertCtrl.create({
      header: 'Request Submitted',
      message: 'Your consultation request has been sent!',
      buttons: ['OK']
    });

    await alert.present();
    this.router.navigate(['/tabs/tab1']);
  }

  private isValidConsultation(): boolean {
    return !!(
      this.consultation.contact &&
      this.consultation.date &&
      this.consultation.timeSlot &&
      this.consultation.type &&
      this.consultation.location &&
      this.consultation.symptoms?.length
    );
  }

  private calculatePrice(): number {
    let basePrice = 100;

    // Adjust price based on consultation type
    switch (this.consultation.type) {
      case 'Emergency': basePrice += 50; break;
      case 'Initial': basePrice += 25; break;
    }

    // Adjust price based on location
    switch (this.consultation.location) {
      case 'Home Visit': basePrice += 75; break;
      case 'Hospital': basePrice += 50; break;
    }

    return basePrice;
  }
}
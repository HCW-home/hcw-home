import { Injectable } from '@angular/core';

export interface Consultation {
  id: string;
  contact: string;
  date: Date;
  timeSlot: string;
  notes: string;
  status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
  practitioner: {
    name: string;
    specialty: string;
    avatar: string;
  };
  type: 'Follow-up' | 'Initial' | 'Regular' | 'Emergency';
  symptoms: string[];
  location: 'Video Call' | 'Hospital' | 'Home Visit';
  price: number;
  reviewed?: boolean;
  rating?: number;
  reviewComment?: string;
  meetingUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  private consultations: Consultation[] = [
    {
      id: '1',
      contact: '1234567890',
      date: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // Tomorrow
      timeSlot: '10:00 AM',
      notes: 'Follow-up consultation',
      status: 'Confirmed',
      practitioner: {
        name: 'Dr. Smith',
        specialty: 'Cardiologist',
        avatar: 'https://ui-avatars.com/api/?name=Dr+Smith&background=0D8ABC&color=fff'
      },
      type: 'Follow-up',
      symptoms: ['Chest pain', 'Shortness of breath'],
      location: 'Video Call',
      price: 150,
      meetingUrl: 'https://meet.google.com/abc-defg-hij'
    },
    {
      id: '2',
      contact: '1234567890',
      date: new Date(new Date().getTime() - 24 * 60 * 60 * 1000), // Yesterday
      timeSlot: '14:30 PM',
      notes: 'Regular checkup',
      status: 'Completed',
      practitioner: {
        name: 'Dr. Johnson',
        specialty: 'General Physician',
        avatar: 'https://ui-avatars.com/api/?name=Dr+Johnson&background=0D8ABC&color=fff'
      },
      type: 'Regular',
      symptoms: ['Fever', 'Cough'],
      location: 'Hospital',
      price: 100
    }
  ];

  addConsultation(consultation: any) {
    console.log('Adding consultation:', consultation);
    this.consultations.push({
      ...consultation,
      status: 'Confirmed',
    });
  }

  getConsultations() {
    console.log('Fetching consultations:', this.consultations);
    return this.consultations.map(c => ({
      ...c,
      date: new Date(c.date)
    }));
  }

  getUpcomingConsultations() {
    const now = new Date();
    return this.getConsultations().filter(c => c.date >= now);
  }

  getPastConsultations() {
    const now = new Date();
    return this.getConsultations().filter(c => c.date < now);
  }

  updateConsultation(consultation: any) {
    const index = this.consultations.findIndex(c => c.id === consultation.id);
    if (index !== -1) {
      this.consultations[index] = consultation;
    }
  }
}

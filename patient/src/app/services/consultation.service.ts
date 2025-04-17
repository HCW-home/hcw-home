import { Injectable } from '@angular/core';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  constructor() { }

  getConsultations() {
    // Mock data - replace with real API call
    return of([
      {
        id: '1',
        practitionerName: 'Dr. Smith',
        date: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        reason: 'Annual checkup',
        status: 'Active'
      },
      {
        id: '2',
        practitionerName: 'Dr. Johnson',
        date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
        reason: 'Follow-up appointment',
        status: 'Waiting'
      },
      {
        id: '3',
        practitionerName: 'Dr. Williams',
        date: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        reason: 'Skin condition',
        status: 'Completed',
        feedback: {
          rating: 4,
          comments: 'Very thorough examination and good advice.'
        }
      },
      {
        id: '4',
        practitionerName: 'Dr. Brown',
        date: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        reason: 'Vaccination',
        status: 'Completed'
      }
    ]).toPromise();
  }

  joinConsultation(consultationId: string) {
    // In a real app, this would navigate to the consultation or open a magic link
    console.log('Joining consultation', consultationId);
    // window.location.href = `/consultation/${consultationId}`;
  }
}
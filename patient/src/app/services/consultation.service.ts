import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Consultation {
  id: number;
  patientId: number;
  practitionerId?: number;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: 'REQUESTED' | 'SCHEDULED' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
  notes?: string;
  joinLink?: string;
  patient: any;
  practitioner?: any;
  feedback?: any;
  createdAt: string;
  updatedAt: string;
}

export interface BookingRequest {
  patientId: number;
  preferredDate: string[];
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  private apiUrl = `${environment.apiUrl}/consultations`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  getConsultations(): Observable<Consultation[]> {
    const user = this.authService.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    return this.http.get<Consultation[]>(`${this.apiUrl}/patient/${user.id}`);
  }

  getConsultation(id: number): Observable<Consultation> {
    return this.http.get<Consultation>(`${this.apiUrl}/${id}`);
  }

  createBookingRequest(bookingRequest: BookingRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/booking`, bookingRequest);
  }

  generateJoinLink(id: number): Observable<{ joinLink: string }> {
    return this.http.get<{ joinLink: string }>(`${this.apiUrl}/${id}/join`);
  }

  updateConsultationStatus(id: number, status: string): Observable<Consultation> {
    return this.http.patch<Consultation>(`${this.apiUrl}/${id}/status`, { status });
  }

  // Helper methods to filter consultations by status
  getUpcomingConsultations(consultations: Consultation[]): Consultation[] {
    const now = new Date();
    return consultations.filter(consultation => 
      ['SCHEDULED', 'CONFIRMED'].includes(consultation.status) && 
      new Date(consultation.scheduledStart) > now
    ).sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  }

  getActiveConsultations(consultations: Consultation[]): Consultation[] {
    return consultations.filter(consultation => 
      consultation.status === 'ACTIVE'
    );
  }

  getPastConsultations(consultations: Consultation[]): Consultation[] {
    const now = new Date();
    return consultations.filter(consultation => 
      ['COMPLETED', 'MISSED', 'CANCELLED'].includes(consultation.status) || 
      (consultation.status !== 'ACTIVE' && new Date(consultation.scheduledEnd) < now)
    ).sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime());
  }
}

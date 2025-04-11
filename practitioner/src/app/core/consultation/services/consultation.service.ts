import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Consultation, InviteFormData } from '../models/consultation.model';

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  private apiUrl = '/api/consultations';

  constructor(private http: HttpClient) {}

  /**
   * Creates a new consultation and generates an invite for the patient
   */
  createConsultationInvite(inviteData: InviteFormData): Observable<Consultation> {
    return this.http.post<Consultation>(`${this.apiUrl}/invite`, inviteData);
  }

  /**
   * Gets a list of consultations for the current practitioner
   */
  getPractitionerConsultations(): Observable<Consultation[]> {
    return this.http.get<Consultation[]>(`${this.apiUrl}/practitioner`);
  }

  /**
   * Gets a consultation by ID
   */
  getConsultationById(consultationId: string): Observable<Consultation> {
    return this.http.get<Consultation>(`${this.apiUrl}/${consultationId}`);
  }

  /**
   * Generates a magic link for a consultation
   */
  generateMagicLink(consultationId: string): Observable<{ magicLink: string }> {
    return this.http.post<{ magicLink: string }>(`${this.apiUrl}/${consultationId}/magic-link`, {});
  }
}
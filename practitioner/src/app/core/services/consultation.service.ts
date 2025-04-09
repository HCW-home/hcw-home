import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Consultation } from '../models/consultation.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ConsultationService {
  private apiUrl = `${environment.apiUrl}/consultations`;

  constructor(private http: HttpClient) {}

  getConsultations(params: any = {}): Observable<Consultation[]> {
    let httpParams = new HttpParams();
    
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<Consultation[]>(this.apiUrl, { params: httpParams });
  }

  getConsultation(id: number): Observable<Consultation> {
    return this.http.get<Consultation>(`${this.apiUrl}/${id}`);
  }

  getPractitionerHistory(
    practitionerId: number,
    params: any = {},
  ): Observable<Consultation[]> {
    let httpParams = new HttpParams();
    
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<Consultation[]>(
      `${this.apiUrl}/practitioner/${practitionerId}/history`,
      { params: httpParams },
    );
  }

  createConsultation(consultation: Partial<Consultation>): Observable<Consultation> {
    return this.http.post<Consultation>(this.apiUrl, consultation);
  }

  updateConsultation(
    id: number,
    consultation: Partial<Consultation>,
  ): Observable<Consultation> {
    return this.http.patch<Consultation>(`${this.apiUrl}/${id}`, consultation);
  }

  deleteConsultation(id: number): Observable<Consultation> {
    return this.http.delete<Consultation>(`${this.apiUrl}/${id}`);
  }
}

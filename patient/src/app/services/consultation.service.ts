import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Consultation, ConsultationsResponse } from '../models/consultation.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Get active consultations for the current patient
   */
  getActiveConsultations(patientId: number): Observable<ConsultationsResponse> {
    return this.http.get<ConsultationsResponse>(`${this.apiUrl}/consultation/patient/${patientId}/active`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Join a consultation as a patient
   */
  joinConsultation(consultationId: number, patientId: number): Observable<{ message: string, success: boolean, consultationId: number }> {
    return this.http.post<{ message: string, success: boolean, consultationId: number }>(
      `${this.apiUrl}/consultation/${consultationId}/join/patient`, 
      { userId: patientId }
    ).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      console.error('Client-side error:', error.error.message);
    } else {
      // Server-side error
      console.error(
        `Backend returned code ${error.status}, ` +
        `body was: ${JSON.stringify(error.error)}`
      );
    }
    
    return throwError(() => new Error('Something went wrong; please try again later.'));
  }
} 
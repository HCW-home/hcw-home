import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { delay, map, catchError } from 'rxjs/operators';
import {
  OpenConsultationResponse,
  OpenConsultation,
  JoinConsultationResponse,
  CloseConsultationResponse,
  OpenConsultationPatient,
  ApiResponse,
} from '../../dtos/consultations/open-consultation.dto';
import { months } from '../../constants/month.enum';

@Injectable({
  providedIn: 'root',
})
export class OpenConsultationService {
  private apiUrl = 'http://localhost:3000/api/v1/consultation';

  constructor(private http: HttpClient) {}

  getOpenConsultations(
    practitionerId: number,
    page: number = 1,
    limit: number = 10
  ): Observable<OpenConsultationResponse> {
    const params = new HttpParams()
      .set('practitionerId', practitionerId.toString())
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http
      .get<ApiResponse<OpenConsultationResponse>>(`${this.apiUrl}/open`, {
        params,
      })
      .pipe(
        map((response) => response.data),
        catchError((error) => {
          console.error('Error fetching open consultations:', error);
          return of({
            consultations: [],
            total: 0,
            currentPage: page,
            totalPages: 0,
            limit,
            hasNextPage: false,
            hasPreviousPage: false,
          });
        })
      );
  }

  getConsultationDetails(
    consultationId: number,
    practitionerId: number
  ): Observable<OpenConsultation | null> {
    const params = new HttpParams().set(
      'practitionerId',
      practitionerId.toString()
    );

    return this.http
      .get<ApiResponse<OpenConsultation>>(
        `${this.apiUrl}/open/${consultationId}/details`,
        { params }
      )
      .pipe(
        map((response) => response.data),
        catchError((error) => {
          console.error('Error fetching consultation details:', error);
          return of(null);
        })
      );
  }

  joinConsultation(
    consultationId: number,
    practitionerId: number
  ): Observable<JoinConsultationResponse> {
    const params = new HttpParams().set(
      'practitionerId',
      practitionerId.toString()
    );

    const body = { consultationId };

    return this.http
      .post<ApiResponse<JoinConsultationResponse>>(
        `${this.apiUrl}/open/join`,
        body,
        { params }
      )
      .pipe(
        map((response) => response.data),
        catchError((error) => {
          console.error('Error joining consultation:', error);
          // Return mock success response
          return of({
            success: false,
            statusCode: 500,
            message: 'Failed to join consultation',
            consultationId,
          });
        })
      );
  }

  closeConsultation(
    consultationId: number,
    practitionerId: number,
    reason?: string
  ): Observable<CloseConsultationResponse> {
    const params = new HttpParams().set(
      'practitionerId',
      practitionerId.toString()
    );

    const body = {
      consultationId,
      ...(reason && { reason }),
    };

    return this.http
      .post<ApiResponse<CloseConsultationResponse>>(
        `${this.apiUrl}/open/close`,
        body,
        { params }
      )
      .pipe(
        map((response) => response.data),
        catchError((error) => {
          console.error('Error closing consultation:', error);
          return of({
            success: false,
            statusCode: 500,
            message: 'Failed to close consultation',
            consultationId,
            closedAt: new Date(),
          });
        })
      );
  }

  sendInvitation(consultationId: number): Observable<{ success: boolean }> {
    return of({ success: true }).pipe(delay(500));
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    return `${months[d.getMonth() as unknown as keyof typeof months]} ${d.getDate()}`;
  }

  formatTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  getPatientDisplayName(patient: OpenConsultationPatient): string {
    if (patient.firstName && patient.lastName) {
      return `${patient.firstName} ${patient.lastName}`;
    } else if (patient.firstName) {
      return patient.firstName;
    } else if (patient.lastName) {
      return patient.lastName;
    } else {
      return patient.initials || 'Unknown Patient';
    }
  }
}

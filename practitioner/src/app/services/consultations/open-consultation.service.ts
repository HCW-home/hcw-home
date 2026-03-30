import { Injectable } from '@angular/core';
import { ToastService } from '../../services/toast/toast.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { API_ENDPOINTS } from '../../constants/api-endpoints';
import {
  OpenConsultationResponse,
  OpenConsultation,
  JoinConsultationResponse,
  CloseConsultationResponse,
  OpenConsultationPatient,
  ApiResponse,
} from '../../dtos/consultations/open-consultation.dto';
import { monthNames } from '../../constants/month.enum';

@Injectable({
  providedIn: 'root',
})
export class OpenConsultationService {
  private apiUrl = API_ENDPOINTS.CONSULTATION;

  constructor(private http: HttpClient, private toastService: ToastService) { }

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
          this.toastService.showError('Error fetching open consultations');
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
          this.toastService.showError('Error fetching consultation details');
          return of(null);
        })
      );
  }

  joinConsultation(
    consultationId: number,
    practitionerId: number
  ): Observable<JoinConsultationResponse> {
    const body = { userId: practitionerId };

    return this.http
      .post<ApiResponse<JoinConsultationResponse>>(
        `${this.apiUrl}/${consultationId}/join/practitioner`,
        body
      )
      .pipe(
        map((response) => {
          return {
            success: response.data?.success || true,
            statusCode: response.data?.statusCode || 200,
            message: response.data?.message || 'Successfully joined consultation',
            consultationId: response.data?.consultationId || consultationId,
            sessionUrl: response.data?.sessionUrl || undefined,
          };
        }),
        catchError((error) => {
          this.toastService.showError('Error joining consultation');
          return of({
            success: false,
            statusCode: 500,
            message: 'Failed to join consultation',
            consultationId,
            sessionUrl: undefined,
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
          this.toastService.showError('Error closing consultation');
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
    return this.http.post<ApiResponse<{ success: boolean }>>(
      `${this.apiUrl}/${consultationId}/invite`, {}
    ).pipe(
      map((response) => response.data),
      catchError((error) => {
        this.toastService.showError('Error sending invitation');
        return of({ success: false });
      })
    );
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    return `${monthNames[d.getMonth()]} ${d.getDate()}`;
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

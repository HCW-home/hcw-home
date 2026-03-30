import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ToastService } from '../../services/toast/toast.service';
import { API_ENDPOINTS } from '../../constants/api-endpoints';
import {
  ConsultationHistoryItem,
  ConsultationDetail,
  User,
  Consultation,
  Participant,
  Message,
} from '../../models/consultations/consultation.model';

import {
  ConsultationHistoryResponseDto,
  ConsultationDetailResponseDto,
  ParticipantResponseDto,
  MessageResponseDto,
} from '../../dtos/consultations';
import { UserResponseDto } from '../../dtos/users';

import { ConsultationStatus } from '../../constants/consultation-status.enum';

@Injectable({
  providedIn: 'root',
})
export class ConsultationHistoryService {
  private apiUrl = API_ENDPOINTS.CONSULTATION;

  constructor(private http: HttpClient, private toastService: ToastService) { }

  getClosedConsultations(
    practitionerId: number
  ): Observable<ConsultationHistoryItem[]> {
    const params = new HttpParams()
      .set('practitionerId', practitionerId.toString())
      .set('status', ConsultationStatus.COMPLETED);

    return this.http.get<any>(`${this.apiUrl}/history`, { params }).pipe(
      map((response) => {
        const data = response?.data?.data || response?.data || response;
        return Array.isArray(data) ? data.map(this.mapToHistoryItem) : [];
      }),
      catchError((error) => this.handleError(error))
    );
  }

  getConsultationDetail(
    consultationId: number
  ): Observable<ConsultationDetail> {
    return this.http
      .get<ConsultationDetailResponseDto>(
        `${this.apiUrl}/${consultationId}/details`
      )
      .pipe(
        map(this.mapToDetailItem),
        catchError((error) => this.handleError(error))
      );
  }


  downloadConsultationPDF(consultationId: number, requesterId: number): Observable<Blob> {
    const headers = new HttpHeaders({
      'Accept': 'application/pdf'
    });

    const params = new HttpParams().set('requesterId', requesterId.toString());

    return this.http.get(`${this.apiUrl}/${consultationId}/pdf`, {
      headers,
      params,
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/pdf')) {
          throw new Error('Invalid file type received. Expected PDF.');
        }

        if (!response.body) {
          throw new Error('No PDF data received from server.');
        }

        return response.body;
      }),
      catchError((error) => this.handleError(error))
    );
  }

  downloadAndSavePDF(
    consultationId: number,
    requesterId: number,
    customFilename?: string
  ): Observable<void> {
    return this.downloadConsultationPDF(consultationId, requesterId).pipe(
      map(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = customFilename || `consultation_${consultationId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }),
      catchError((error) => this.handleError(error))
    );
  }

  private saveBlob(blob: Blob, filename: string): void {
    try {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error: any) {
      this.toastService.showError('Failed to save PDF file to device');
      throw new Error('Failed to save PDF file to device');
    }
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unexpected error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Network error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'Unauthorized access. Please login again.';
          break;
        case 403:
          errorMessage = 'You do not have permission to access this consultation.';
          break;
        case 404:
          errorMessage = 'Consultation not found.';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later.';
          break;
        default:
          errorMessage = error.error?.message || `Error ${error.status}: ${error.statusText}`;
      }
    }

    this.toastService.showError(errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  private mapToHistoryItem = (data: any): ConsultationHistoryItem => {
    const consultationData = data.consultation || data;
    const patientData = data.patient;
    const duration = data.duration || '';

    const start = consultationData.startedAt ? new Date(consultationData.startedAt) : undefined;
    const end = consultationData.closedAt ? new Date(consultationData.closedAt) : undefined;
    const calculatedDuration = start && end ? this.calculateDuration(start, end) : duration;

    const participants: Participant[] = (data.participants || consultationData.participants || []).map(
      (p: ParticipantResponseDto) => ({
        id: p.id,
        consultationId: p.consultationId,
        userId: p.userId,
        isActive: p.isActive,
        isBeneficiary: p.isBeneficiary,
        token: p.token,
        joinedAt: p.joinedAt ? new Date(p.joinedAt) : null,
      })
    );

    const consultation: Consultation = {
      id: consultationData.id,
      scheduledDate: consultationData.scheduledDate ? new Date(consultationData.scheduledDate) : null,
      createdAt: consultationData.createdAt ? new Date(consultationData.createdAt) : null,
      startedAt: start || null,
      closedAt: end || null,
      createdBy: consultationData.createdBy,
      groupId: consultationData.groupId,
      ownerId: consultationData.owner || consultationData.ownerId,
      whatsappTemplateId: consultationData.whatsappTemplateId,
      status: consultationData.status,
    };

    const patient: User = this.mapUserResponseToUser(patientData);

    return {
      consultation,
      patient,
      participants,
      duration: calculatedDuration,
    };
  };

  private mapToDetailItem = (
    response: any
  ): ConsultationDetail => {
    const data = response?.data?.data || response?.data || response;


    const history = this.mapToHistoryItem(data);

    const messages: Message[] = (data.messages || []).map(
      (m: MessageResponseDto) => ({
        id: m.id,
        userId: m.userId,
        content: m.content,
        consultationId: m.consultationId,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
      })
    );

    return {
      ...history,
      messages,
    };
  };

  private mapUserResponseToUser(userDto: UserResponseDto): User {
    return {
      id: userDto.id,
      role: userDto.role,
      firstName: userDto.firstName,
      lastName: userDto.lastName,
      email: userDto.email,
      temporaryAccount: userDto.temporaryAccount,
      phoneNumber: userDto.phoneNumber,
      country: userDto.country,
      sex: userDto.sex,
      status: userDto.status,
      createdAt: new Date(userDto.createdAt),
      updatedAt: new Date(userDto.updatedAt),
    };
  }

  private calculateDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    if (mins > 0) {
      return `${mins} minute${mins !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''
        }`;
    }
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  }
}


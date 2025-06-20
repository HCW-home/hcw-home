import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  ConsultationHistoryItem,
  ConsultationDetail,
} from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';

@Injectable({
  providedIn: 'root',
})
export class ConsultationHistoryService {
  private apiUrl = 'http://localhost:3000/api/v1/consultation';

  constructor(private http: HttpClient) {}

  getClosedConsultations(
    practitionerId: number
  ): Observable<ConsultationHistoryItem[]> {
    const params = new HttpParams()
      .set('practitionerId', practitionerId.toString())
      .set('status', ConsultationStatus.COMPLETED);

    return this.http
      .get<any[]>(`${this.apiUrl}/history`, { params })
      .pipe(map((rows) => rows.map(this.mapToHistoryItem)));
  }

  getConsultationDetail(
    consultationId: number
  ): Observable<ConsultationDetail> {
    return this.http
      .get<any>(`${this.apiUrl}/${consultationId}/details`)
      .pipe(map(this.mapToDetailItem));
  }

  downloadConsultationPDF(consultationId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${consultationId}/pdf`, {
      responseType: 'blob',
    });
  }

  private mapToHistoryItem = (data: any): ConsultationHistoryItem => {
    const start = data.startedAt ? new Date(data.startedAt) : undefined;
    const end = data.closedAt ? new Date(data.closedAt) : undefined;
    const duration = start && end ? this.calculateDuration(start, end) : '';

    const participants = (data.participants || []).map((p: any) => ({
      id: p.id,
      consultationId: p.consultationId,
      userId: p.userId,
      isActive: p.isActive,
      isBeneficiary: p.isBeneficiary,
      token: p.token,
      joinedAt: p.joinedAt ? new Date(p.joinedAt) : undefined,
    }));

    const participantCount = participants.length;

    return {
      consultation: {
        id: data.id,
        scheduledDate: data.scheduledDate
          ? new Date(data.scheduledDate)
          : undefined,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        startedAt: start,
        closedAt: end,
        createdBy: data.createdBy,
        groupId: data.groupId,
        owner: data.owner,
        whatsappTemplateId: data.whatsappTemplateId,
        status: data.status,
      },
      patient: {
        id: data.patient.id,
        role: data.patient.role,
        firstName: data.patient.firstName,
        lastName: data.patient.lastName,
        phoneNumber: data.patient.phoneNumber,
        country: data.patient.country,
        sex: data.patient.sex,
        status: data.patient.status,
        createdAt: new Date(data.patient.createdAt),
        updatedAt: new Date(data.patient.updatedAt),
      },
      participants,
      duration,
    };
  };

  private mapToDetailItem = (data: any): ConsultationDetail => {
    const history = this.mapToHistoryItem(data);

    const messages = (data.messages || []).map((m: any) => ({
      id: m.id,
      userId: m.userId,
      content: m.content,
      consultationId: m.consultationId,
      createdAt: new Date(m.createdAt),
    }));

    return {
      ...history,
      messages,
    };
  };

  private calculateDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    if (mins > 0) {
      return `${mins} minute${mins !== 1 ? 's' : ''} ${secs} second${
        secs !== 1 ? 's' : ''
      }`;
    }
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  }
}

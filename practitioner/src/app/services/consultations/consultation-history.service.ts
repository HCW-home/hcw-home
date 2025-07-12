import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { tap } from 'rxjs/operators';
// Domain Models
import {
  ConsultationHistoryItem,
  ConsultationDetail,
  User,
  Consultation,
  Participant,
  Message,
} from '../../models/consultations/consultation.model';

// DTOs
import {
  ConsultationHistoryResponseDto,
  ConsultationDetailResponseDto,
  ParticipantResponseDto,
  MessageResponseDto,
} from '../../dtos/consultations';
import { UserResponseDto } from '../../dtos/users';

// Constants
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

    return this.http.get<unknown>(`${this.apiUrl}/history`, { params }).pipe(
      map((res) => {
        const rows = (res as any).rows ?? (res as any).data ?? res;
        return Array.isArray(rows) ? rows.map(this.mapToHistoryItem) : [];
      })
    );
  }

  getConsultationDetail(
    consultationId: number
  ): Observable<ConsultationDetail> {
    return this.http
      .get<ConsultationDetailResponseDto>(
        `${this.apiUrl}/${consultationId}/details`
      )
      .pipe(map(this.mapToDetailItem));
  }

  downloadConsultationPDF(consultationId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${consultationId}/pdf`, {
      responseType: 'blob',
    });
  }

  private mapToHistoryItem = (
    data: ConsultationHistoryResponseDto
  ): ConsultationHistoryItem => {
    const start = data.startedAt ? new Date(data.startedAt) : undefined;
    const end = data.closedAt ? new Date(data.closedAt) : undefined;
    const duration = start && end ? this.calculateDuration(start, end) : '';

    const participants: Participant[] = (data.participants || []).map(
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
      id: data.id,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
      createdAt: data.createdAt ? new Date(data.createdAt) : null,
      startedAt: start || null,
      closedAt: end || null,
      createdBy: data.createdBy,
      groupId: data.groupId,
      ownerId: data.ownerId,
      whatsappTemplateId: data.whatsappTemplateId,
      status: data.status,
    };

    const patient: User = this.mapUserResponseToUser(data.patient);

    return {
      consultation,
      patient,
      participants,
      duration,
    };
  };

  private mapToDetailItem = (
    data: ConsultationDetailResponseDto
  ): ConsultationDetail => {
    const history = this.mapToHistoryItem(data);

    const messages: Message[] = (data.messages || []).map(
      (m: MessageResponseDto) => ({
        id: m.id,
        userId: m.userId,
        content: m.content,
        consultationId: m.consultationId,
        createdAt: new Date(m.createdAt),
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
      return `${mins} minute${mins !== 1 ? 's' : ''} ${secs} second${
        secs !== 1 ? 's' : ''
      }`;
    }
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  }
}

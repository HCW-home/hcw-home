import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { tap } from 'rxjs/operators';
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
  private apiUrl = 'http://localhost:3000/api/v1/consultation';

  constructor(private http: HttpClient) {}

getClosedConsultations(
  practitionerId: number
): Observable<ConsultationHistoryItem[]> {
  const params = new HttpParams()
    .set('practitionerId', practitionerId.toString())
    .set('status', ConsultationStatus.COMPLETED);

  return this.http.get<any>(`${this.apiUrl}/history`, { params }).pipe(
    map((response) => {
      console.log('API Response:', response); 
      
      const data = response?.data?.data || response?.data || response;
      
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', data);
        return [];
      }
      
      return data.map(this.mapToHistoryItem);
    }),
    tap((result) => console.log('Mapped result:', result)) 
  );
}
getConsultationDetail(
  consultationId: number
): Observable<ConsultationDetail> {
  return this.http
    .get<any>(`${this.apiUrl}/${consultationId}/details`)
    .pipe(
      map((response) => {
        const payload =
          response?.data?.data ||
          response?.data ||
          response;

        return this.mapToDetailItem(payload as ConsultationDetailResponseDto);
      })
    );
}


  downloadConsultationPDF(consultationId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${consultationId}/pdf`, {
      responseType: 'blob',
    });
  }

private mapToHistoryItem = (
  data: any // Update this type to match your actual API response
): ConsultationHistoryItem => {
  // Handle the nested structure from your API
  const consultationData = data.consultation;
  const patientData = data.patient;
  const duration = data.duration || '';

  const start = consultationData.startedAt ? new Date(consultationData.startedAt) : undefined;
  const end = consultationData.closedAt ? new Date(consultationData.closedAt) : undefined;
  
  // Use the duration from API if available, otherwise calculate it
  const calculatedDuration = duration || (start && end ? this.calculateDuration(start, end) : '');

  // Handle participants - check if they exist in the response
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
    id: consultationData.id,
    scheduledDate: consultationData.scheduledDate ? new Date(consultationData.scheduledDate) : null,
    createdAt: consultationData.createdAt ? new Date(consultationData.createdAt) : null,
    startedAt: start || null,
    closedAt: end || null,
    createdBy: consultationData.createdBy,
    groupId: consultationData.groupId,
    ownerId: consultationData.ownerId || consultationData.owner, // Handle both property names
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

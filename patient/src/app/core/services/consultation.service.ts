import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService, PaginatedResponse } from './api.service';
import {
  Consultation,
  Appointment,
  Participant,
  ConsultationRequest,
  ConsultationMessage,
  CustomField,
  IDashboardResponse,
  IParticipantDetail
} from '../models/consultation.model';

export interface ConsultationFilters {
  page?: number;
  limit?: number;
  status?: string;
}

export interface AppointmentFilters {
  page?: number;
  limit?: number;
  status?: string;
}

export interface ConsultationRequestData {
  beneficiary_id?: number;
  expected_with_id?: number;
  expected_at?: string;
  reason_id: number | undefined;
  type: 'online' | 'inPerson';
  comment?: string;
  custom_fields?: { field: number; value: string | null }[];
}

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  constructor(private api: ApiService) {}

  getDashboard(): Observable<IDashboardResponse> {
    return this.api.get<IDashboardResponse>('/user/dashboard/');
  }

  getMyConsultations(filters?: ConsultationFilters): Observable<PaginatedResponse<Consultation>> {
    return this.api.get<PaginatedResponse<Consultation>>('/user/consultations/', filters);
  }

  getConsultationById(id: number): Observable<Consultation> {
    return this.api.get<Consultation>(`/user/consultations/${id}/`);
  }

  getMyAppointments(filters?: AppointmentFilters): Observable<PaginatedResponse<Appointment>> {
    return this.api.get<PaginatedResponse<Appointment>>('/user/appointments/', filters);
  }

  getAppointmentById(id: number): Observable<Appointment> {
    return this.api.get<Appointment>(`/user/appointments/${id}/`);
  }


  cancelAppointment(id: number): Observable<Appointment> {
    return this.api.patch<Appointment>(`/appointments/${id}/`, { status: 'cancelled' });
  }

  markConsultationRead(consultationId: number): Observable<any> {
    return this.api.post(`/user/consultations/${consultationId}/mark_read/`, {});
  }

  getConsultationMessagesPaginated(consultationId: number, page: number = 1): Observable<PaginatedResponse<ConsultationMessage>> {
    return this.api.get<PaginatedResponse<ConsultationMessage>>(`/user/consultations/${consultationId}/messages/`, { page });
  }

  sendConsultationMessage(consultationId: number, content: string, attachment?: File): Observable<ConsultationMessage> {
    const formData = new FormData();
    formData.append('content', content);
    if (attachment) {
      formData.append('attachment', attachment);
    }
    return this.api.post<ConsultationMessage>(`/user/consultations/${consultationId}/messages/`, formData);
  }

  updateConsultationMessage(messageId: number, content: string): Observable<ConsultationMessage> {
    return this.api.patch<ConsultationMessage>(`/messages/${messageId}/`, { content });
  }

  deleteConsultationMessage(messageId: number): Observable<ConsultationMessage> {
    return this.api.delete<ConsultationMessage>(`/messages/${messageId}/`);
  }

  createConsultationRequest(data: ConsultationRequestData): Observable<ConsultationRequest> {
    return this.api.post<ConsultationRequest>('/requests/', data);
  }

  cancelConsultationRequest(id: number): Observable<void> {
    return this.api.post<void>(`/requests/${id}/cancel/`, {});
  }

  getRequestById(id: number): Observable<ConsultationRequest> {
    return this.api.get<ConsultationRequest>(`/requests/${id}/`);
  }

  joinConsultation(consultationId: number): Observable<{
    url: string;
    token: string;
    room: string;
  }> {
    return this.api.get<{ url: string; token: string; room: string }>(
      `/user/consultations/${consultationId}/join/`
    );
  }

  respondToCall(consultationId: number, accepted: boolean): Observable<{ detail: string }> {
    return this.api.post<{ detail: string }>(
      `/user/consultations/${consultationId}/call_response/`,
      { accepted }
    );
  }

  joinAppointment(appointmentId: number): Observable<{
    url: string;
    token: string;
    room: string;
  }> {
    return this.api.get<{ url: string; token: string; room: string }>(
      `/user/appointments/${appointmentId}/join/`
    );
  }

  leaveAppointment(appointmentId: number): Observable<{detail: string}> {
    return this.api.post<{detail: string}>(
      `/user/appointments/${appointmentId}/leave/`,
      {}
    );
  }

  confirmAppointmentPresence(appointmentId: number, isPresent: boolean): Observable<{
    detail: string;
    is_confirmed: boolean;
  }> {
    return this.api.post<{ detail: string; is_confirmed: boolean }>(
      `/user/appointments/${appointmentId}/presence/`,
      { is_confirmed: isPresent }
    );
  }

  getMessageAttachment(messageId: number): Observable<Blob> {
    return this.api.getBlob(`/messages/${messageId}/attachment/`);
  }

  getParticipantById(id: number): Observable<IParticipantDetail> {
    return this.api.get<IParticipantDetail>(`/user/participants/${id}/`);
  }

  confirmParticipantPresence(participantId: number, isConfirmed: boolean | null): Observable<IParticipantDetail> {
    return this.api.patch<IParticipantDetail>(
      `/user/participants/${participantId}/`,
      { is_confirmed: isConfirmed }
    );
  }

  getCustomFields(targetModel: string): Observable<CustomField[]> {
    return this.api.get<CustomField[]>('/custom-fields/', { target_model: targetModel });
  }
}

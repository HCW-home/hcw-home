import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../interceptors/auth.interceptor';
import {
  Queue,
  Participant,
  BookingSlot,
  Appointment,
  Consultation,
  AvailableSlot,
  CreateBookingSlot,
  ConsultationMessage,
  ConsultationRequest,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
  CreateParticipantRequest,
  CreateConsultationRequest,
  CreateConsultationRequestPayload,
  CustomField,
  DashboardResponse,
  IParticipantDetail,
} from '../models/consultation';
import { PaginatedResponse } from '../models/global';

@Injectable({
  providedIn: 'root',
})
export class ConsultationService {
  private apiUrl = `${environment.apiUrl}`;
  http: HttpClient = inject(HttpClient);

  getConsultations(params?: {
    page?: number;
    page_size?: number;
    group?: number;
    beneficiary?: number;
    created_by?: number;
    owned_by?: number;
    is_closed?: boolean;
    scheduled?: boolean;
    closed_at?: string;
    search?: string;
  }): Observable<PaginatedResponse<Consultation>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    return this.http.get<PaginatedResponse<Consultation>>(
      `${this.apiUrl}/consultations/`,
      { params: httpParams }
    );
  }

  getConsultation(id: number): Observable<Consultation> {
    return this.http.get<Consultation>(`${this.apiUrl}/consultations/${id}/`);
  }

  createConsultation(
    data: CreateConsultationRequest
  ): Observable<Consultation> {
    return this.http.post<Consultation>(`${this.apiUrl}/consultations/`, data);
  }

  updateConsultation(
    id: number,
    data: Partial<CreateConsultationRequest>
  ): Observable<Consultation> {
    return this.http.patch<Consultation>(
      `${this.apiUrl}/consultations/${id}/`,
      data
    );
  }

  deleteConsultation(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/consultations/${id}/`);
  }

  closeConsultation(id: number): Observable<Consultation> {
    return this.http.post<Consultation>(
      `${this.apiUrl}/consultations/${id}/close/`,
      {},
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
    );
  }

  reopenConsultation(id: number): Observable<Consultation> {
    return this.http.post<Consultation>(
      `${this.apiUrl}/consultations/${id}/reopen/`,
      {}
    );
  }

  getConsultationAppointments(
    consultationId: number,
    params?: {
      page?: number;
      page_size?: number;
      status?: string;
      future?: boolean;
    }
  ): Observable<PaginatedResponse<Appointment>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    httpParams = httpParams.set('consultation', consultationId.toString());
    return this.http.get<PaginatedResponse<Appointment>>(
      `${this.apiUrl}/appointments/`,
      { params: httpParams }
    );
  }

  createConsultationAppointment(
    consultationId: number,
    data: CreateAppointmentRequest
  ): Observable<Appointment> {
    return this.http.post<Appointment>(
      `${this.apiUrl}/appointments/`,
      {
        ...data,
        consultation_id: consultationId,
      },
      {
        context: new HttpContext().set(SKIP_ERROR_TOAST, true),
      }
    );
  }

  createAppointment(data: CreateAppointmentRequest): Observable<Appointment> {
    return this.http.post<Appointment>(
      `${this.apiUrl}/appointments/`,
      data,
      {
        context: new HttpContext().set(SKIP_ERROR_TOAST, true),
      }
    );
  }

  getAppointments(params?: {
    page?: number;
    page_size?: number;
    consultation__beneficiary?: number;
    consultation__created_by?: number;
    consultation__owned_by?: number;
    status?: string;
    scheduled_at__date__gte?: string;
    scheduled_at__date__lte?: string;
    future?: boolean;
  }): Observable<PaginatedResponse<Appointment>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    return this.http.get<PaginatedResponse<Appointment>>(
      `${this.apiUrl}/appointments/`,
      { params: httpParams }
    );
  }

  getAppointment(appointmentId: number): Observable<Appointment> {
    return this.http.get<Appointment>(
      `${this.apiUrl}/appointments/${appointmentId}/`
    );
  }

  updateAppointment(
    appointmentId: number,
    data: UpdateAppointmentRequest
  ): Observable<Appointment> {
    return this.http.patch<Appointment>(
      `${this.apiUrl}/appointments/${appointmentId}/`,
      data
    );
  }

  deleteAppointment(appointmentId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/appointments/${appointmentId}/`
    );
  }

  sendAppointment(appointmentId: number): Observable<Appointment> {
    return this.http.post<Appointment>(
      `${this.apiUrl}/appointments/${appointmentId}/send/`,
      {}
    );
  }

  getConsultationMessages(
    consultationId: number,
    params?: { page?: number; page_size?: number }
  ): Observable<PaginatedResponse<ConsultationMessage>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    return this.http.get<PaginatedResponse<ConsultationMessage>>(
      `${this.apiUrl}/consultations/${consultationId}/messages/`,
      { params: httpParams }
    );
  }

  sendConsultationMessage(
    consultationId: number,
    data: { content?: string; attachment?: File }
  ): Observable<ConsultationMessage> {
    const formData = new FormData();
    if (data.content) {
      formData.append('content', data.content);
    }
    if (data.attachment) {
      formData.append('attachment', data.attachment);
    }

    return this.http.post<ConsultationMessage>(
      `${this.apiUrl}/consultations/${consultationId}/messages/`,
      formData,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
    );
  }

  updateConsultationMessage(
    messageId: number,
    content: string
  ): Observable<ConsultationMessage> {
    return this.http.patch<ConsultationMessage>(
      `${this.apiUrl}/messages/${messageId}/`,
      { content }
    );
  }

  deleteConsultationMessage(
    messageId: number
  ): Observable<ConsultationMessage> {
    return this.http.delete<ConsultationMessage>(
      `${this.apiUrl}/messages/${messageId}/`
    );
  }

  getQueues(): Observable<Queue[]> {
    return this.http.get<Queue[]>(`${this.apiUrl}/queues/`);
  }

  getQueue(id: number): Observable<Queue> {
    return this.http.get<Queue>(`${this.apiUrl}/queues/${id}/`);
  }

  getBookingSlots(params?: {
    page?: number;
    page_size?: number;
    user?: number;
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
    valid_until?: string;
  }): Observable<PaginatedResponse<BookingSlot>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    return this.http.get<PaginatedResponse<BookingSlot>>(
      `${this.apiUrl}/user/bookingslots/`,
      { params: httpParams }
    );
  }

  createBookingSlot(data: CreateBookingSlot): Observable<BookingSlot> {
    return this.http.post<BookingSlot>(
      `${this.apiUrl}/user/bookingslots/`,
      data
    );
  }

  updateBookingSlot(
    id: number,
    data: Partial<CreateBookingSlot>
  ): Observable<BookingSlot> {
    return this.http.patch<BookingSlot>(
      `${this.apiUrl}/user/bookingslots/${id}/`,
      data
    );
  }

  deleteBookingSlot(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/user/bookingslots/${id}/`);
  }

  joinAppointment(appointmentId: number): Observable<{
    url: string;
    token: string;
    room: string;
  }> {
    return this.http.get<{ url: string; token: string; room: string }>(
      `${this.apiUrl}/appointments/${appointmentId}/join/`
    );
  }

  joinConsultation(consultationId: number): Observable<{
    url: string;
    token: string;
    room: string;
  }> {
    return this.http.get<{ url: string; token: string; room: string }>(
      `${this.apiUrl}/consultations/${consultationId}/join/`
    );
  }

  callBeneficiary(consultationId: number): Observable<{
    url: string;
    token: string;
    room: string;
  }> {
    return this.http.post<{ url: string; token: string; room: string }>(
      `${this.apiUrl}/consultations/${consultationId}/call/`,
      {}
    );
  }

  leaveAppointment(appointmentId: number): Observable<{detail: string}> {
    return this.http.post<{detail: string}>(
      `${this.apiUrl}/appointments/${appointmentId}/leave/`,
      {}
    );
  }

  getMessageAttachment(messageId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/messages/${messageId}/attachment/`, {
      responseType: 'blob',
    });
  }

  exportConsultationPdf(consultationId: number): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/consultations/${consultationId}/export/pdf/`,
      {
        responseType: 'blob',
      }
    );
  }

  getDashboard(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${this.apiUrl}/dashboard/`);
  }

  getParticipantById(id: string): Observable<IParticipantDetail> {
    return this.http.get<IParticipantDetail>(
      `${this.apiUrl}/participants/${id}/`
    );
  }

  confirmParticipantPresence(
    participantId: string,
    isConfirmed: boolean | null
  ): Observable<IParticipantDetail> {
    return this.http.patch<IParticipantDetail>(
      `${this.apiUrl}/user/participants/${participantId}/`,
      { is_confirmed: isConfirmed }
    );
  }

  startRecording(
    appointmentId: number
  ): Observable<{ status: string; egress_id: string }> {
    return this.http.post<{ status: string; egress_id: string }>(
      `${this.apiUrl}/appointments/${appointmentId}/start_recording/`,
      {}
    );
  }

  stopRecording(appointmentId: number): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${this.apiUrl}/appointments/${appointmentId}/stop_recording/`,
      {}
    );
  }

  downloadMessageRecording(messageId: number): Observable<Blob> {
    return this.http.post(
      `${this.apiUrl}/messages/${messageId}/download_recording/`,
      {},
      { responseType: 'blob' }
    );
  }

  getCustomFields(targetModel: string): Observable<CustomField[]> {
    return this.http.get<CustomField[]>(
      `${this.apiUrl}/custom-fields/`,
      { params: new HttpParams().set('target_model', targetModel) }
    );
  }

  getParticipantAccessUrl(participantId: number): Observable<{
    access_url: string;
    token_created_at: string;
    expires_at: string;
  }> {
    return this.http.post<{
      access_url: string;
      token_created_at: string;
      expires_at: string;
    }>(`${this.apiUrl}/participants/${participantId}/access_url/`, {});
  }
}

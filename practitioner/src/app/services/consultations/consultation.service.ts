import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { of, type Observable, map, switchMap, catchError } from 'rxjs';
import type { Consultation } from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';
import { formatConsultationTime } from '../../utils/date-utils';
import type {
  ConsultationWithPatient,
  WaitingRoomItem,
} from '../../dtos/consultations/consultation-dashboard-response.dto';
import { UserService } from '../user.service';
import { WaitingRoomResponse } from '../../dtos/consultations/consultation-dashboard-response.dto';
import { API_ENDPOINTS } from '../../constants/api-endpoints';

export interface SubmitFeedbackRequest {
  consultationId: number;
  satisfaction?: 'SATISFIED' | 'NEUTRAL' | 'DISSATISFIED';
  comment?: string;
}

export interface FeedbackResponse {
  id: number;
  consultationId: number;
  userId: number;
  satisfaction: 'SATISFIED' | 'NEUTRAL' | 'DISSATISFIED' | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackApiResponse {
  success: boolean;
  data: FeedbackResponse | null;
  message: string;
  statusCode: number;
  timestamp: string;
}

export interface CreatePatientConsultationRequest {
  firstName: string;
  lastName: string;
  gender: string;
  language: string;
  contact: string;
  group?: string;
  scheduledDate?: Date;
  specialityId?: number;
  symptoms?: string;
  manualSend?: boolean;
  planLater?: boolean;
  timezone?: string;
  guests?: {
    lovedOne?: boolean;
    colleague?: boolean;
  };
}

export interface CreatePatientConsultationResponse {
  success: boolean;
  data: {
    success: {
      patient: {
        id: number;
        firstName: string;
        lastName: string;
        email?: string;
        phoneNumber?: string;
        isNewPatient: boolean;
      }; consultation: {
        id: number;
        status: string;
        ownerId: number;
        scheduledDate?: Date;
      };
    };
    data: { patient: any; consultation: any; };
    patient: {
      id: number;
      firstName: string;
      lastName: string;
      email?: string;
      phoneNumber?: string;
      isNewPatient: boolean;
    };
    consultation: {
      id: number;
      status: string;
      ownerId: number;
      scheduledDate?: Date;
    };
  };
  message: string;
  statusCode: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConsultationService {
  /**
   * Send a message to a patient in the waiting room
   */
  async sendMessageToPatient(consultationId: number, message: string): Promise<void> {
    try {
      await this.http.post<any>(`${this.baseUrl}/${consultationId}/send-message`, {
        message,
        recipientType: 'patient'
      }).toPromise();
    } catch (error: any) {
      console.error('Failed to send message to patient:', error);
      throw error;
    }
  }

  /**
   * Dismiss a patient from the waiting room
   */
  async dismissPatientFromWaitingRoom(consultationId: number): Promise<void> {
    try {
      await this.http.post<any>(`${this.baseUrl}/${consultationId}/dismiss-patient`, {}).toPromise();
    } catch (error: any) {
      console.error('Failed to dismiss patient:', error);
      throw error;
    }
  }

  private baseUrl = API_ENDPOINTS.CONSULTATION;

  constructor(
    private http: HttpClient,
    private userService: UserService
  ) { }

  createPatientAndConsultation(
    formData: CreatePatientConsultationRequest
  ): Observable<CreatePatientConsultationResponse> {
    return this.userService.getCurrentUser().pipe(
      switchMap(user => {
        const params = new HttpParams().set('practitionerId', user.id.toString());

        console.log('Creating patient and consultation with data:', formData);
        console.log('Practitioner ID:', user.id);

        return this.http.post<CreatePatientConsultationResponse>(
          `${this.baseUrl}/create-patient-consultation`,
          formData,
          { params }
        );
      })
    );
  }

  getWaitingConsultations(page = 1, limit = 10, sortOrder: 'asc' | 'desc' = 'asc'): Observable<WaitingRoomResponse> {
    return this.userService.getCurrentUser().pipe(
      switchMap(user => {
        const params = new HttpParams()
          .set('userId', user.id.toString())
          .set('page', page.toString())
          .set('limit', limit.toString())
          .set('sortOrder', sortOrder);

        return this.http
          .get<any>(`${this.baseUrl}/waiting-room`, { params })
          .pipe(
            map((response) => ({
              success: response.data.success,
              statusCode: response.data.statusCode,
              message: response.data.message,
              waitingRooms: response.data.waitingRooms || [],
              totalCount: response.data.totalCount || 0,
              currentPage: response.data.currentPage || 1,
              totalPages: response.data.totalPages || 1,
              timestamp: response.timestamp
            }))
          );
      })
    );
  }

  getWaitingRoomConsultations(practitionerId: number, page: number = 1, limit: number = 10): Observable<any> {
    const params = new HttpParams()
      .set('userId', practitionerId.toString())
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<any>(`${this.baseUrl}/waiting-room`, { params })
      .pipe(
        map((response) => {
          return response?.data || {
            success: true,
            waitingRooms: [],
            totalCount: 0,
            totalPages: 0
          };
        })
      );
  }

  getOpenConsultations(): Observable<ConsultationWithPatient[]> {
    return this.userService.getCurrentUser().pipe(
      switchMap(user => {
        const params = new HttpParams()
          .set('practitionerId', user.id.toString())
          .set('page', '1')
          .set('limit', '50');

        return this.http
          .get<any>(`${this.baseUrl}/open`, { params })
          .pipe(
            map((response) => {
              const consultations = response?.data?.consultations || [];
              return consultations.map((item: any) =>
                this.convertOpenConsultationToConsultationWithPatient(item, user.id)
              );
            })
          );
      })
    );
  }

  private convertWaitingRoomToConsultationWithPatient(
    item: WaitingRoomItem,
    practitionerId: number
  ): ConsultationWithPatient {
    return {
      patient: {
        id: 0,
        firstName: null,
        lastName: null,
        initials: item.patientInitials,
        sex: null,
        isOffline: false,
      },
      consultation: {
        id: item.id,
        scheduledDate: new Date(),
        createdAt: new Date(),
        startedAt: item.joinTime ? new Date(item.joinTime) : new Date(),
        closedAt: undefined,
        createdBy: practitionerId,
        ownerId: practitionerId,
        groupId: undefined,
        whatsappTemplateId: undefined,
        status: ConsultationStatus.WAITING,
      }
    };
  }

  private convertOpenConsultationToConsultationWithPatient(
    item: any,
    practitionerId: number
  ): ConsultationWithPatient {
    const startedAtDate = typeof item.startedAt === 'string'
      ? new Date(item.startedAt)
      : (item.startedAt instanceof Date ? item.startedAt : new Date());

    let status: ConsultationStatus;
    switch (item.status) {
      case 'ACTIVE':
        status = ConsultationStatus.ACTIVE;
        break;
      case 'WAITING':
        status = ConsultationStatus.WAITING;
        break;
      case 'SCHEDULED':
        status = ConsultationStatus.SCHEDULED;
        break;
      default:
        status = ConsultationStatus.WAITING;
    }

    return {
      patient: {
        id: item.patient?.id || 0,
        firstName: item.patient?.firstName || null,
        lastName: item.patient?.lastName || null,
        initials: item.patient?.initials || 'N/A',
        sex: item.patient?.sex || null,
        isOffline: item.patient?.isOffline || false,
      },
      consultation: {
        id: item.id,
        scheduledDate: startedAtDate,
        createdAt: startedAtDate,
        startedAt: startedAtDate,
        closedAt: undefined,
        createdBy: practitionerId,
        ownerId: practitionerId,
        groupId: undefined,
        whatsappTemplateId: undefined,
        status: status,
      }
    };
  }

  formatTime(date: Date): string {
    return formatConsultationTime(date);
  }

  submitFeedback(feedbackData: SubmitFeedbackRequest): Observable<FeedbackApiResponse> {
    return this.userService.getCurrentUser().pipe(
      switchMap(user => {
        const params = new HttpParams().set('userId', user.id.toString());

        // Map frontend satisfaction values to backend enum values
        let mappedSatisfaction: 'SATISFIED' | 'NEUTRAL' | 'DISSATISFIED' | undefined;
        if (feedbackData.satisfaction === 'SATISFIED') {
          mappedSatisfaction = 'SATISFIED';
        } else if (feedbackData.satisfaction === 'NEUTRAL') {
          mappedSatisfaction = 'NEUTRAL';
        } else if (feedbackData.satisfaction === 'DISSATISFIED') {
          mappedSatisfaction = 'DISSATISFIED';
        } else {
          mappedSatisfaction = feedbackData.satisfaction;
        }

        const payload = {
          consultationId: feedbackData.consultationId,
          satisfaction: mappedSatisfaction,
          comment: feedbackData.comment
        };

        return this.http.post<FeedbackApiResponse>(
          `${this.baseUrl}/feedback`,
          payload,
          { params }
        );
      })
    );
  }

  getFeedback(consultationId: number): Observable<FeedbackApiResponse> {
    return this.userService.getCurrentUser().pipe(
      switchMap(user => {
        const params = new HttpParams().set('userId', user.id.toString());

        return this.http.get<FeedbackApiResponse>(
          `${this.baseUrl}/${consultationId}/feedback`,
          { params }
        );
      })
    );
  }
}


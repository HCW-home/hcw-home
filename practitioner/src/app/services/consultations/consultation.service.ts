import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { of, type Observable, map, switchMap } from 'rxjs';
import type { Consultation } from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';
import { formatConsultationTime } from '../../utils/date-utils';
import type {
  ConsultationWithPatient,
  WaitingRoomItem,
} from '../../dtos/consultations/consultation-dashboard-response.dto';
import { UserService } from '../user.service';

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
  private baseUrl = 'http://localhost:3000/api/v1/consultation';

  constructor(
    private http: HttpClient,
    private userService: UserService
  ) {}

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

  getWaitingConsultations(): Observable<ConsultationWithPatient[]> {
    return this.userService.getCurrentUser().pipe(
      switchMap(user => {
        const params = new HttpParams().set('userId', user.id.toString());
        
        return this.http
          .get<any>(`${this.baseUrl}/waiting-room`, { params })
          .pipe(
            map((response) => {
              const waitingRooms = response?.data?.data?.waitingRooms || [];
              return waitingRooms.map((item: WaitingRoomItem) =>
                this.convertWaitingRoomToConsultationWithPatient(item, user.id)
              );
            })
          );
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
}
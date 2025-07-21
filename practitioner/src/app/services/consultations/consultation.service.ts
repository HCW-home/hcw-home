import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { of, type Observable, map } from 'rxjs';
import type { Consultation } from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';
import { formatConsultationTime } from '../../utils/date-utils';
import type {
  ConsultationWithPatient,
  WaitingRoomItem,
} from '../../dtos/consultations/consultation-dashboard-response.dto';


@Injectable({
  providedIn: 'root',
})
export class ConsultationService {
  private baseUrl = 'http://localhost:3000/api/v1/consultation';
  private readonly practitionerId = 16;

  constructor(private http: HttpClient) {}

  getWaitingConsultations(): Observable<ConsultationWithPatient[]> {
    const params = new HttpParams().set(
      'userId',
      this.practitionerId.toString()
    );

    return this.http
      .get<any>(`${this.baseUrl}/waiting-room`, { params })
      .pipe(
        map((response) => {
          const waitingRooms = response?.data?.data?.waitingRooms || [];
          return waitingRooms.map((item: WaitingRoomItem) =>
            this.convertWaitingRoomToConsultationWithPatient(item)
          );
        })
      );
  }

  getOpenConsultations(): Observable<ConsultationWithPatient[]> {
    const params = new HttpParams()
      .set('practitionerId', this.practitionerId.toString())
      .set('page', '1')
      .set('limit', '50'); 

    return this.http
      .get<any>(`${this.baseUrl}/open`, { params })
      .pipe(
        map((response) => {
          const consultations = response?.data?.consultations || [];
          return consultations.map((item: any) =>
            this.convertOpenConsultationToConsultationWithPatient(item)
          );
        })
      );
  }

  private convertWaitingRoomToConsultationWithPatient(
    item: WaitingRoomItem
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
        createdBy: this.practitionerId,
        ownerId: this.practitionerId,
        groupId: undefined,
        whatsappTemplateId: undefined,
        status: ConsultationStatus.WAITING,
      }
    };
  }

  private convertOpenConsultationToConsultationWithPatient(
    item: any
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
        createdBy: this.practitionerId,
        ownerId: this.practitionerId,
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
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { of, type Observable, map } from 'rxjs';
import type { Consultation } from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';
import { formatConsultationTime } from '../../utils/date-utils';
import type {
  WaitingRoomResponse,
  WaitingRoomItem,
  OpenConsultationItem,
} from '../../dtos/consultations/consultation-dashboard-response.dto';
import type {
  ApiResponse,
  OpenConsultationResponse,
} from '../../dtos/consultations/open-consultation.dto';
@Injectable({
  providedIn: 'root',
})
export class ConsultationService {
  private baseUrl = 'http://localhost:3000/api/v1/consultation';

  private readonly practitionerId = 1;

  constructor(private http: HttpClient) {}

  getWaitingConsultations(): Observable<Consultation[]> {
    const params = new HttpParams().set(
      'userId',
      this.practitionerId.toString()
    );

    return this.http
      .get<ApiResponse<WaitingRoomResponse>>(`${this.baseUrl}/waiting-room`, {
        params,
      })
      .pipe(
        map((response) => {
          // Convert WaitingRoomItem[] to Consultation[] format
          return response.data.waitingRooms.map((item) =>
            this.convertWaitingRoomToConsultation(item)
          );
        })
      );
  }


  getOpenConsultations(): Observable<Consultation[]> {
    const params = new HttpParams()
      .set('practitionerId', this.practitionerId.toString())
      .set('page', '1')
      .set('limit', '50'); 

    return this.http
      .get<ApiResponse<OpenConsultationResponse>>(`${this.baseUrl}/open`, {
        params,
      })
      .pipe(
        map((response) => {
          return response.data.consultations.map((item) =>
            this.convertOpenConsultationToConsultation(item)
          );
        })
      );
  }


  private convertWaitingRoomToConsultation(
    item: WaitingRoomItem
  ): Consultation {
    return {
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
    };
  }

  private convertOpenConsultationToConsultation(
    item: OpenConsultationItem | any
  ): Consultation {
    const startedAtDate = item.startedAt instanceof Date ? item.startedAt : new Date(item.startedAt);
    return {
      id: item.id,
      scheduledDate: startedAtDate,
      createdAt: startedAtDate,
      startedAt: startedAtDate,
      closedAt: undefined,
      createdBy: this.practitionerId,
      ownerId: this.practitionerId,
      groupId: undefined,
      whatsappTemplateId: undefined,
      status:
        item.status === 'ACTIVE'
          ? ConsultationStatus.ACTIVE
          : ConsultationStatus.WAITING,
    };
  }

  formatTime(date: Date): string {
    return formatConsultationTime(date);
  }
}

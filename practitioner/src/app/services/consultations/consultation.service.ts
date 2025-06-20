import { Injectable } from '@angular/core';
import { of, type Observable } from 'rxjs';
import type { Consultation } from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';
import { formatConsultationTime } from '../../utils/date-utils';

@Injectable({
  providedIn: 'root',
})
export class ConsultationService {
  private readonly mockConsultations: Consultation[] = [
    {
      id: 1,
      scheduledDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      closedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
      createdBy: 101,
      owner: 201,
      groupId: 301,
      whatsappTemplateId: 1001,
      status: ConsultationStatus.ACTIVE,
    },
    {
      id: 2,
      scheduledDate: new Date(),
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
      startedAt: new Date(),
      closedAt: new Date(),
      createdBy: 102,
      owner: 202,
      groupId: 302,
      status: ConsultationStatus.WAITING,
    },
    {
      id: 3,
      scheduledDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      startedAt: new Date(),
      closedAt: new Date(),
      createdBy: 103,
      owner: 203,
      groupId: 303,
      status: ConsultationStatus.WAITING,
    },
    {
      id: 4,
      scheduledDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      closedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
      createdBy: 104,
      owner: 204,
      groupId: 304,
      status: ConsultationStatus.COMPLETED,
    },
  ];

  constructor() {}

  getWaitingConsultations(): Observable<Consultation[]> {
    return of(
      this.mockConsultations.filter(
        (c) => c.status === ConsultationStatus.WAITING
      )
    );
  }

  getOpenConsultations(): Observable<Consultation[]> {
    return of(
      this.mockConsultations.filter(
        (c) => c.status === ConsultationStatus.ACTIVE
      )
    );
  }

  formatTime(date: Date): string {
    return formatConsultationTime(date);
  }
}

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
      id: '1',
      patientName: 'Olivier Bitsch',
      joinTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      status: ConsultationStatus.Active,
    },
    {
      id: '2',
      patientName: 'Olivier Bitsch',
      joinTime: new Date(),
      status: ConsultationStatus.Waiting,
    },
    {
      id: '3',
      patientName: 'Olivier Bitsch',
      joinTime: new Date(),
      status: ConsultationStatus.Waiting,
    },
    {
      id: '4',
      patientName: 'Olivier Bitsch',
      joinTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      status: ConsultationStatus.Completed,
    },
  ];

  constructor() {}

  getWaitingConsultations(): Observable<Consultation[]> {
    return of(
      this.mockConsultations.filter(
        (c) => c.status === ConsultationStatus.Waiting
      )
    );
  }

  getOpenConsultations(): Observable<Consultation[]> {
    return of(
      this.mockConsultations.filter(
        (c) => c.status === ConsultationStatus.Active
      )
    );
  }

  formatTime(date: Date): string {
    return formatConsultationTime(date);
  }
}

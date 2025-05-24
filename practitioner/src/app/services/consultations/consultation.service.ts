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
      scheduledDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: ConsultationStatus.Active,
      participants: [
        {
          user: {
            firstName: 'Olivier',
            lastName: 'Bitsch',
            country: 'France',
          },
          joinedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    },
    {
      id: '2',
      scheduledDate: new Date().toISOString(),
      status: ConsultationStatus.Waiting,
      participants: [
        {
          user: {
            firstName: 'Olivier',
            lastName: 'Bitsch',
            country: 'France',
          },
          joinedAt: new Date().toISOString(),
        },
      ],
    },
    {
      id: '3',
      scheduledDate: new Date().toISOString(),
      status: ConsultationStatus.Waiting,
      participants: [
        {
          user: {
            firstName: 'Olivier',
            lastName: 'Bitsch',
            country: 'France',
          },
          joinedAt: new Date().toISOString(),
        },
      ],
    },
    {
      id: '4',
      scheduledDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: ConsultationStatus.Completed,
      participants: [
        {
          user: {
            firstName: 'Olivier',
            lastName: 'Bitsch',
            country: 'France',
          },
          joinedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    },
  ];

  constructor() {}

  getWaitingConsultations(): Observable<Consultation[]> {
    return of(this.addDerivedFields(
      this.mockConsultations.filter(c => c.status === ConsultationStatus.Waiting)
    ));
  }

  getOpenConsultations(): Observable<Consultation[]> {
    return of(this.addDerivedFields(
      this.mockConsultations.filter(c => c.status === ConsultationStatus.Active)
    ));
  }

  formatTime(date: Date): string {
    return formatConsultationTime(date);
  }

  private addDerivedFields(consultations: Consultation[]): Consultation[] {
    return consultations.map((consultation) => {
      const firstParticipant = consultation.participants[0];
      return {
        ...consultation,
        patientName: `${firstParticipant?.user.firstName} ${firstParticipant?.user.lastName}`,
        joinTime: new Date(firstParticipant?.joinedAt),
      };
    });
  }
}

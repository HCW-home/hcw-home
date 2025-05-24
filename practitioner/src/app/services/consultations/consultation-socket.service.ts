import { Injectable } from '@angular/core';
import io, { type Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { Subject } from 'rxjs';

interface PatientJoinedPayload {
  consultationId: number;
  patientId: number;
}

@Injectable({
  providedIn: 'root',
})
export class ConsultationSocketService {
  private socket: Socket;
  private patientJoinedSubject = new Subject<PatientJoinedPayload>();

  patientJoined$ = this.patientJoinedSubject.asObservable();

  constructor() {
    this.socket = io(`${environment.backendUrl}/consultation`, {
      query: {
        consultationId: 1, 
        userId: 99,
      },
    });

    this.socket.on('patient:joined', (payload: PatientJoinedPayload) => {
      this.patientJoinedSubject.next(payload);
    });
  }
}

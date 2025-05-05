import { Injectable } from '@angular/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import type { Consultation } from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';
import { formatConsultationTime } from '../../utils/date-utils';
import { SocketService } from '../socket/socket.service';

@Injectable({
  providedIn: 'root',
})
export class ConsultationService {
  private readonly mockConsultations: Consultation[] = [
    {
      id: '1',
      patientName: 'John Doe',
      joinTime: new Date(),
      status: ConsultationStatus.Active,
    },
    {
      id: '2',
      patientName: 'Jane Smith',
      joinTime: new Date(),
      status: ConsultationStatus.Waiting,
    },
    {
      id: '3',
      patientName: 'Bob Johnson',
      joinTime: new Date(),
      status: ConsultationStatus.Waiting,
    },
    {
      id: '4',
      patientName: 'Alice Brown',
      joinTime: new Date(),
      status: ConsultationStatus.Completed,
    },
  ];

  // Behavior subjects to store and emit consultations
  private waitingConsultationsSubject = new BehaviorSubject<Consultation[]>(
    this.mockConsultations.filter(
      (c) => c.status === ConsultationStatus.Waiting
    )
  );
  
  private openConsultationsSubject = new BehaviorSubject<Consultation[]>(
    this.mockConsultations.filter(
      (c) => c.status === ConsultationStatus.Active
    )
  );

  constructor(private socketService: SocketService) {
    // Subscribe to patient-joined events
    this.socketService.onPatientJoined().subscribe(newConsultation => {
      this.addNewWaitingConsultation(newConsultation);
    });
  }

  /**
   * Initialize socket connection for the practitioner
   * @param practitionerId The ID of the practitioner
   */
  initializeSocketConnection(practitionerId: number): void {
    this.socketService.connect(practitionerId);
  }

  /**
   * Add a new consultation to the waiting list
   */
  private addNewWaitingConsultation(consultation: Consultation): void {
    // Get current waiting consultations
    const currentWaiting = this.waitingConsultationsSubject.value;
    
    // Check if consultation with same ID already exists
    const exists = currentWaiting.some(c => c.id === consultation.id);
    
    if (!exists) {
      // Add new consultation to the list
      const updatedConsultations = [...currentWaiting, consultation];
      
      // Update the subject
      this.waitingConsultationsSubject.next(updatedConsultations);
    }
  }

  getWaitingConsultations(): Observable<Consultation[]> {
    return this.waitingConsultationsSubject.asObservable();
  }

  getOpenConsultations(): Observable<Consultation[]> {
    return this.openConsultationsSubject.asObservable();
  }

  getFormattedTime(date: Date): string {
    return formatConsultationTime(date);
  }
}

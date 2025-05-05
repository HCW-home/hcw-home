import { Injectable } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Consultation } from '../../models/consultations/consultation.model';
import { ConsultationStatus } from '../../constants/consultation-status.enum';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket!: Socket;
  private newPatientSubject = new Subject<Consultation>();

  constructor() { }

  /**
   * Connect to the WebSocket server for a specific practitioner
   * @param practitionerId The ID of the practitioner
   * @param consultationId Optional consultation ID to scope the connection
   */
  connect(practitionerId: number, consultationId?: number): void {
    // Disconnect existing connection if any
    this.disconnect();

    // Connect to the WebSocket server
    const baseUrl = environment.apiUrl || 'http://localhost:3000';
    const queryParams = consultationId 
      ? `?consultationId=${consultationId}&userId=${practitionerId}`
      : `?userId=${practitionerId}`;
    
    this.socket = io(`${baseUrl}/consultation${queryParams}`, {
      transports: ['websocket'],
      autoConnect: true
    });

    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('patient-joined', (data: any) => {
      console.log('Patient joined event received', data);
      
      // Convert to Consultation model
      const consultation: Consultation = {
        id: data.consultationId.toString(),
        patientName: data.patientName,
        joinTime: new Date(data.joinTime),
        status: ConsultationStatus.Waiting
      };

      // Play notification sound
      this.playNotificationSound();
      
      // Emit event for components to subscribe to
      this.newPatientSubject.next(consultation);
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  /**
   * Get an observable that emits when a new patient joins
   */
  onPatientJoined(): Observable<Consultation> {
    return this.newPatientSubject.asObservable();
  }

  /**
   * Play a notification sound when a patient joins
   */
  private playNotificationSound(): void {
    const audio = new Audio('/assets/audio/notification.mp3');
    audio.play().catch(error => {
      console.error('Failed to play notification sound:', error);
    });
  }
} 
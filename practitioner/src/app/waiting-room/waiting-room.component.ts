import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ConsultationService } from '../services/consultations/consultation.service';
import { ConsultationSocketService } from '../services/consultations/consultation-socket.service';
import { ToastService } from '../services/toast.service'; 
import { Consultation } from '../models/consultations/consultation.model';

@Component({
  selector: 'app-waiting-room',
  templateUrl: './waiting-room.component.html',
  styleUrls: ['./waiting-room.component.scss'],
})
export class WaitingRoomComponent implements OnInit, OnDestroy {
  consultations: Consultation[] = [];
  private subscriptions = new Subscription();

  constructor(
    private consultationService: ConsultationService,
    private socketService: ConsultationSocketService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.loadConsultations();

    // Subscribe to patient joined events from the socket
    this.subscriptions.add(
      this.socketService.patientJoined$.subscribe(({ consultationId, patientId }) => {
        this.toastService.show(`A patient joined consultation ${consultationId}`, {
          type: 'info',
        });
        this.loadConsultations();
      })
    );
  }

  loadConsultations() {
    this.consultationService.getWaitingConsultations().subscribe((data) => {
      this.consultations = data;
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}

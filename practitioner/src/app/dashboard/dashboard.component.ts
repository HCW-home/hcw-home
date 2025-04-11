import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationCardComponent } from '../components/consultations-card/consultations-card.component';
import { RoutePaths } from '../constants/route-paths.enum';
import { ConsultationService } from '../services//consultations/consultation.service';
import { type Consultation } from '../models/consultations/consultation.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ConsultationCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  waitingConsultations = signal<Consultation[]>([]);
  openConsultations = signal<Consultation[]>([]);

  constructor(private consultationService: ConsultationService) {}

  ngOnInit(): void {
    this.consultationService.getWaitingConsultations().subscribe((data) => {
      this.waitingConsultations.set(data);
    });

    this.consultationService.getOpenConsultations().subscribe((data) => {
      this.openConsultations.set(data);
    });
  }

  cards = computed(() => [
    {
      title: 'WAITING ROOM',
      description: 'Consultations waiting to be attended',
      consultations: this.waitingConsultations(),
      routerLink: RoutePaths.WaitingRoom,
    },
    {
      title: 'OPEN CONSULTATIONS',
      description: 'Consultations in progress',
      consultations: this.openConsultations(),
      routerLink: RoutePaths.OpenConsultations,
    },
  ]);
}

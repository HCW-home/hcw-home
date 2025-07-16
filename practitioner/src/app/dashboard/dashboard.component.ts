import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationCardComponent } from '../components/consultations-card/consultations-card.component';
import { InviteFormComponent } from '../components/invite-form/invite-form.component';
import { RoutePaths } from '../constants/route-paths.enum';
import { ConsultationService } from '../services/consultations/consultation.service';
import { ConsultationWithPatient } from '../dtos';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ConsultationCardComponent, InviteFormComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  waitingConsultations = signal<ConsultationWithPatient[]>([]);
  openConsultations = signal<ConsultationWithPatient[]>([]);

  isInviting = signal(false);

  constructor(private consultationService: ConsultationService) {}

  ngOnInit(): void {
    this.consultationService
      .getWaitingConsultations()
      .subscribe({
        next: (data) => {
          console.log('Waiting consultations received:', data);
          this.waitingConsultations.set(data);
        },
        error: (error) => {
          console.error('Error fetching waiting consultations:', error);
        }
      });
    
    this.consultationService
      .getOpenConsultations()
      .subscribe({
        next: (data) => {
          console.log('Open consultations received:', data);
          this.openConsultations.set(data);
        },
        error: (error) => {
          console.error('Error fetching open consultations:', error);
        }
      });
  }

  cards = computed(() => {
    const cards = [
      {
        title: 'WAITING ROOM',
        description: 'Consultations waiting to be attended',
        consultations: this.waitingConsultations(),
        routerLink: RoutePaths.WaitingRoom,
        showInvite: true,
      },
      {
        title: 'OPEN CONSULTATIONS',
        description: 'Consultations in progress',
        consultations: this.openConsultations(),
        routerLink: RoutePaths.OpenConsultations,
        showInvite: false,
      },
    ];
    console.log('Cards computed:', cards);
    return cards;
  });

  trackByTitle(_idx: number, card: { title: string }): string {
    return card.title;
  }

  openInviteSelector() {
    this.isInviting.set(true);
  }

  handleInvite(payload: any) {
    console.log('Invite payload:', payload);
    this.closeInvite();
  }

  closeInvite() {
    this.isInviting.set(false);
  }
}
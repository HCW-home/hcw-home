import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsultationCardComponent } from '../components/consultations-card/consultations-card.component';
import { InviteFormComponent } from '../components/invite-form/invite-form.component';
import { RoutePaths } from '../constants/route-paths.enum';
import { ConsultationService } from '../services/consultations/consultation.service';
import type { Consultation } from '../models/consultations/consultation.model';
import { GuidedTourService } from '../services/guided-tour.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ConsultationCardComponent, InviteFormComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  waitingConsultations = signal<Consultation[]>([]);
  openConsultations = signal<Consultation[]>([]);

  isInviting = signal(false);

  constructor(private consultationService: ConsultationService, private guidedTourService: GuidedTourService) {}

  ngOnInit(): void {
    this.consultationService
      .getWaitingConsultations()
      .subscribe((data) => this.waitingConsultations.set(data));
    this.consultationService
      .getOpenConsultations()
      .subscribe((data) => this.openConsultations.set(data));
  }

  cards = computed(() => [
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
  ]);

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

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ConsultationService } from '../../core/services/consultation.service';
import { Consultation, ConsultationStatus } from '../../core/models/consultation.model';
import { format } from 'date-fns';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
})
export class WelcomeComponent implements OnInit {
  // Upcoming consultations
  upcomingConsultations: Consultation[] = [];
  // Recent consultations
  recentConsultations: Consultation[] = [];
  loading = false;
  error: string | null = null;

  // Temporary practitioner ID (would come from auth service in a real app)
  practitionerId = 1;

  constructor(private consultationService: ConsultationService) {}

  ngOnInit(): void {
    this.loadUpcomingConsultations();
    this.loadRecentConsultations();
  }

  loadUpcomingConsultations(): void {
    this.loading = true;

    const params = {
      practitionerId: this.practitionerId,
      status: ConsultationStatus.SCHEDULED
    };

    this.consultationService.getConsultations(params)
      .subscribe({
        next: (consultations) => {
          this.upcomingConsultations = consultations.slice(0, 3); // Show only the first 3
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading upcoming consultations:', err);
          this.loading = false;
        }
      });
  }

  loadRecentConsultations(): void {
    const params = {
      practitionerId: this.practitionerId,
      status: ConsultationStatus.COMPLETED
    };

    this.consultationService.getConsultations(params)
      .subscribe({
        next: (consultations) => {
          this.recentConsultations = consultations.slice(0, 3); // Show only the first 3
        },
        error: (err) => {
          console.error('Error loading recent consultations:', err);
        }
      });
  }

  formatDate(date: string | Date): string {
    if (!date) return 'N/A';
    return format(new Date(date), 'MMM d, yyyy h:mm a');
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ConsultationService } from '../../core/services/consultation.service';
import { Consultation, ConsultationStatus } from '../../core/models/consultation.model';
import { format } from 'date-fns';

@Component({
  selector: 'app-consultation-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './consultation-detail.component.html',
  styleUrls: ['./consultation-detail.component.scss'],
})
export class ConsultationDetailComponent implements OnInit {
  consultation: Consultation | null = null;
  loading = false;
  error: string | null = null;
  consultationId: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private consultationService: ConsultationService,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.consultationId = +id;
        this.loadConsultation();
      } else {
        this.error = 'Consultation ID not provided';
      }
    });
  }

  loadConsultation(): void {
    this.loading = true;
    this.error = null;

    this.consultationService.getConsultation(this.consultationId)
      .subscribe({
        next: (consultation) => {
          this.consultation = consultation;
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Failed to load consultation details. Please try again.';
          console.error('Error loading consultation:', err);
          this.loading = false;
        }
      });
  }

  getStatusClass(status: ConsultationStatus): string {
    switch (status) {
      case ConsultationStatus.COMPLETED:
        return 'status-completed';
      case ConsultationStatus.CANCELLED:
        return 'status-cancelled';
      case ConsultationStatus.IN_PROGRESS:
        return 'status-in-progress';
      case ConsultationStatus.SCHEDULED:
        return 'status-scheduled';
      default:
        return '';
    }
  }

  formatDate(date: string | undefined): string {
    if (!date) return 'N/A';
    return format(new Date(date), 'MMM d, yyyy h:mm a');
  }

  goBack(): void {
    this.router.navigate(['/history']);
  }
}

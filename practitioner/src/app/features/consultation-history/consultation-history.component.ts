import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ConsultationService } from '../../core/services/consultation.service';
import { Consultation, ConsultationStatus } from '../../core/models/consultation.model';
import { format } from 'date-fns';

@Component({
  selector: 'app-consultation-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './consultation-history.component.html',
  styleUrls: ['./consultation-history.component.scss'],
})
export class ConsultationHistoryComponent implements OnInit {
  consultations: Consultation[] = [];
  filteredConsultations: Consultation[] = [];
  displayedColumns: string[] = [
    'id',
    'patientName',
    'scheduledAt',
    'endedAt',
    'status',
    'actions',
  ];

  loading = false;
  error: string | null = null;

  // Pagination
  pageSize = 10;
  pageIndex = 0;
  totalItems = 0;

  // Filtering
  filterForm: FormGroup;

  // Temporary practitioner ID (would come from auth service in a real app)
  practitionerId = 1;

  constructor(
    private consultationService: ConsultationService,
    private fb: FormBuilder,
    private router: Router,
  ) {
    this.filterForm = this.fb.group({
      patientName: [''],
      startDate: [null],
      endDate: [null],
    });
  }

  ngOnInit(): void {
    this.loadConsultations();
  }

  loadConsultations(): void {
    this.loading = true;
    this.error = null;

    const filters: any = {};

    const patientName = this.filterForm.get('patientName')?.value;
    if (patientName) {
      filters.patientName = patientName;
    }

    const startDate = this.filterForm.get('startDate')?.value;
    if (startDate) {
      filters.startDate = format(startDate, 'yyyy-MM-dd');
    }

    const endDate = this.filterForm.get('endDate')?.value;
    if (endDate) {
      filters.endDate = format(endDate, 'yyyy-MM-dd');
    }

    this.consultationService.getPractitionerHistory(this.practitionerId, filters)
      .subscribe({
        next: (consultations) => {
          this.consultations = consultations;
          this.applyPagination();
          this.totalItems = consultations.length;
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Failed to load consultations. Please try again.';
          console.error('Error loading consultations:', err);
          this.loading = false;
        }
      });
  }

  applyFilter(): void {
    this.pageIndex = 0; // Reset to first page when filtering
    this.loadConsultations();
  }

  resetFilter(): void {
    this.filterForm.reset();
    this.loadConsultations();
  }

  applyPagination(): void {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.filteredConsultations = this.consultations.slice(startIndex, endIndex);
  }

  handlePageEvent(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.applyPagination();
  }

  sortData(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      return;
    }

    this.consultations = this.consultations.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'id':
          return this.compare(a.id, b.id, isAsc);
        case 'patientName':
          return this.compare(
            a.patient?.name || '',
            b.patient?.name || '',
            isAsc,
          );
        case 'scheduledAt':
          return this.compare(
            new Date(a.scheduledAt).getTime(),
            new Date(b.scheduledAt).getTime(),
            isAsc,
          );
        case 'endedAt':
          return this.compare(
            a.endedAt ? new Date(a.endedAt).getTime() : 0,
            b.endedAt ? new Date(b.endedAt).getTime() : 0,
            isAsc,
          );
        case 'status':
          return this.compare(a.status, b.status, isAsc);
        default:
          return 0;
      }
    });

    this.applyPagination();
  }

  private compare(a: number | string, b: number | string, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
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

  viewDetails(consultation: Consultation): void {
    this.router.navigate(['/consultation', consultation.id]);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { 
  AvailabilityService, 
  PractitionerAvailability, 
  TimeSlot, 
  CreateAvailabilityRequest,
  UpdateAvailabilityRequest 
} from '../../services/availability.service';
import { TourMatMenuModule } from 'ngx-ui-tour-md-menu';
import { TourType } from '../../models/tour';

@Component({
  selector: 'app-availability',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTabsModule,
    MatSnackBarModule,
    MatTooltipModule,
    TourMatMenuModule
  ],
  templateUrl: './availability.component.html',
  styleUrls: ['./availability.component.scss']
})
export class AvailabilityComponent implements OnInit {
  availabilityForm: FormGroup;
  generateSlotsForm: FormGroup;
  
  availabilities: PractitionerAvailability[] = [];
  timeSlots: TimeSlot[] = [];
  
  loading = false;
  selectedTabIndex = 0;
  
  displayedColumns = ['day', 'time', 'duration', 'status', 'actions'];
  slotsDisplayedColumns = ['date', 'time', 'status', 'actions'];
  readonly TourType = TourType;
  
  daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  constructor(
    private fb: FormBuilder,
    private availabilityService: AvailabilityService,
    private snackBar: MatSnackBar
  ) {
    this.availabilityForm = this.fb.group({
      dayOfWeek: ['', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      slotDuration: [30, [Validators.required, Validators.min(15), Validators.max(120)]]
    });

    this.generateSlotsForm = this.fb.group({
      startDate: ['', Validators.required],
      endDate: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadAvailabilities();
    this.loadTimeSlots();
  }

  loadAvailabilities() {
    this.loading = true;
    this.availabilityService.getMyAvailability().subscribe({
      next: (response) => {
        this.availabilities = response?.data || response || [];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading availabilities:', error);
        this.snackBar.open('Error loading availabilities', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  loadTimeSlots() {
    const today = new Date();
    const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const startDate = today.toISOString().split('T')[0];
    const endDate = nextMonth.toISOString().split('T')[0];
    
    this.availabilityService.getMyTimeSlots(startDate, endDate).subscribe({
      next: (response) => {
        this.timeSlots = response?.data || response || [];
      },
      error: (error) => {
        console.error('Error loading time slots:', error);
        this.snackBar.open('Error loading time slots', 'Close', { duration: 3000 });
      }
    });
  }

  createAvailability() {
    if (this.availabilityForm.valid) {
      const formData = this.availabilityForm.value as CreateAvailabilityRequest;
      
      this.availabilityService.createAvailability(formData).subscribe({
        next: (response) => {
          const newAvailability = response?.data || response;
          if (newAvailability) {
            this.availabilities.push(newAvailability);
          }
          this.availabilityForm.reset();
          this.snackBar.open('Availability created successfully', 'Close', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error creating availability:', error);
          this.snackBar.open('Error creating availability', 'Close', { duration: 3000 });
        }
      });
    }
  }

  toggleAvailabilityStatus(availability: PractitionerAvailability) {
    const updateData: UpdateAvailabilityRequest = {
      isActive: !availability.isActive
    };

    this.availabilityService.updateAvailability(availability.id, updateData).subscribe({
      next: (updatedAvailability) => {
        const index = this.availabilities.findIndex(a => a.id === availability.id);
        if (index !== -1) {
          this.availabilities[index] = updatedAvailability;
        }
        this.snackBar.open(
          `Availability ${updatedAvailability.isActive ? 'enabled' : 'disabled'}`, 
          'Close', 
          { duration: 3000 }
        );
      },
      error: (error) => {
        console.error('Error updating availability:', error);
        this.snackBar.open('Error updating availability', 'Close', { duration: 3000 });
      }
    });
  }

  deleteAvailability(id: number) {
    if (confirm('Are you sure you want to delete this availability?')) {
      this.availabilityService.deleteAvailability(id).subscribe({
        next: () => {
          this.availabilities = this.availabilities.filter(a => a.id !== id);
          this.snackBar.open('Availability deleted successfully', 'Close', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error deleting availability:', error);
          this.snackBar.open('Error deleting availability', 'Close', { duration: 3000 });
        }
      });
    }
  }

  generateTimeSlots() {
    if (this.generateSlotsForm.valid) {
      const { startDate, endDate } = this.generateSlotsForm.value;
      
      this.availabilityService.generateTimeSlots(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      ).subscribe({
        next: (slots) => {
          this.timeSlots = [...this.timeSlots, ...slots];
          this.snackBar.open(`Generated ${slots.length} time slots`, 'Close', { duration: 3000 });
          this.generateSlotsForm.reset();
        },
        error: (error) => {
          console.error('Error generating slots:', error);
          this.snackBar.open('Error generating time slots', 'Close', { duration: 3000 });
        }
      });
    }
  }

  toggleSlotStatus(slot: TimeSlot) {
    const newStatus = slot.status === 'AVAILABLE' ? 'BLOCKED' : 'AVAILABLE';
    
    this.availabilityService.updateSlotStatus(slot.id, newStatus).subscribe({
      next: (updatedSlot) => {
        const index = this.timeSlots.findIndex(s => s.id === slot.id);
        if (index !== -1) {
          this.timeSlots[index] = updatedSlot;
        }
        this.snackBar.open(`Slot ${newStatus.toLowerCase()}`, 'Close', { duration: 3000 });
      },
      error: (error) => {
        console.error('Error updating slot:', error);
        this.snackBar.open('Error updating slot', 'Close', { duration: 3000 });
      }
    });
  }

  getDayName(dayOfWeek: number): string {
    return this.availabilityService.getDayName(dayOfWeek);
  }

  getSlotStatusClass(status: string): string {
    switch (status) {
      case 'AVAILABLE': return 'status-available';
      case 'BOOKED': return 'status-booked';
      case 'BLOCKED': return 'status-blocked';
      default: return '';
    }
  }

  formatTime(time: string): string {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
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
import { ToastService } from '../../services/toast/toast.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AvailabilityService,
  PractitionerAvailability,
  TimeSlot,
  CreateAvailabilityRequest,
  UpdateAvailabilityRequest
} from '../../services/availability.service';

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
    MatTooltipModule
  ],
  templateUrl: './availability.component.html',
  styleUrls: ['./availability.component.scss']
})
export class AvailabilityComponent implements OnInit, OnDestroy {
  availabilityForm!: FormGroup;
  generateSlotsForm!: FormGroup;
  availabilities: PractitionerAvailability[] = [];
  timeSlots: TimeSlot[] = [];
  currentPage = 1;
  pageSize = 20;
  pageSizes = [10, 20, 50];
  loading = false;
  selectedTabIndex = 0;
  displayedColumns = ['day', 'time', 'duration', 'status', 'actions'];
  slotsDisplayedColumns = ['date', 'time', 'status', 'actions'];
  daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];
  private onDestroy: (() => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor(
    private fb: FormBuilder,
    private availabilityService: AvailabilityService,
    private toastService: ToastService
  ) {
    this.availabilityForm = this.fb.group({
      dayOfWeek: [null, Validators.required],
      startTime: ['09:00', Validators.required],
      endTime: ['17:00', Validators.required],
      slotDuration: [30, [Validators.required, Validators.min(15), Validators.max(120)]]
    });
    this.generateSlotsForm = this.fb.group({
      startDate: [new Date(), Validators.required],
      endDate: [new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), Validators.required]
    });
    this.availabilityForm.addValidators(this.timeRangeValidator);
  }

  ngOnInit() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    console.log('=== PRACTITIONER DEBUG INFO ===');
    console.log('Current user from localStorage:', currentUser);
    console.log('Practitioner ID:', currentUser.id);
    console.log('Current date:', new Date().toISOString());
    console.log('Today (local):', new Date().toDateString());
    console.log('================================');
    this.setupAdminSyncListener();
    this.loadAvailabilities();
    this.loadTimeSlots();
    this.setupAutoRefresh();
  }

  setupAdminSyncListener() {
    window.addEventListener('storage', (event) => {
      if (event.key === 'adminScheduleUpdate' && event.newValue) {
        try {
          const notification = JSON.parse(event.newValue);
          const currentPractitionerId = this.availabilityService.getCurrentPractitionerId();
          if (notification.practitionerId === currentPractitionerId || notification.practitionerId === null) {
            console.log('Received admin update notification:', notification);
            this.toastService.showInfo('Schedule updated by admin. Syncing changes...');
            setTimeout(() => {
              this.forceReloadFromAdmin();
            }, 1000);
          }
        } catch (e) {
          console.error('Error handling admin sync:', e);
        }
      }
    });
    try {
      const bc = new BroadcastChannel('admin-practitioner-sync');
      bc.onmessage = (event) => {
        const { type, practitionerId } = event.data;
        if (type === 'ADMIN_UPDATE') {
          const currentPractitionerId = this.availabilityService.getCurrentPractitionerId();
          if (practitionerId === currentPractitionerId || practitionerId === null) {
            console.log('Received broadcast admin update:', event.data);
            this.toastService.showInfo('Admin made changes. Refreshing...');
            this.forceReloadFromAdmin();
          }
        }
      };
    } catch (e) {
      console.log('BroadcastChannel not supported, using localStorage only');
    }
  }

  setupAutoRefresh() {
    const refreshInterval = setInterval(() => {
      console.log('Auto-refresh triggered');
      this.checkForAdminChanges();
      this.loadAvailabilities();
      setTimeout(() => this.loadTimeSlots(), 2000);
    }, 60000);
    this.onDestroy = () => {
      clearInterval(refreshInterval);
      if (this.broadcastChannel) {
        this.broadcastChannel.close();
      }
    };
  }

  loadAvailabilities() {
    this.availabilityService.getMyAvailability().subscribe({
      next: (response) => {
        console.log('Availabilities response:', response);
        if (response && Array.isArray(response.data)) {
          this.availabilities = response.data;
        } else if (Array.isArray(response)) {
          this.availabilities = response;
        } else {
          this.availabilities = [];
        }
        console.log('Loaded availabilities:', this.availabilities);
      },
      error: (error) => {
        this.toastService.showError('Error loading availabilities');
        this.loading = false;
      }
    });
  }

  loadTimeSlots() {
    const { startDate, endDate } = this.availabilityService.getStandardDateRange();
    const cacheBuster = `?_t=${Date.now()}`;
    this.availabilityService.getMyTimeSlots(startDate, endDate, cacheBuster).subscribe({
      next: (response) => {
        console.log('Time slots response:', response);
        try {
          if (response && response.data && Array.isArray(response.data)) {
            this.timeSlots = response.data;
          } else if (Array.isArray(response)) {
            this.timeSlots = response;
          } else {
            this.timeSlots = [];
          }
          if (this.timeSlots.length > 0) {
            this.timeSlots.sort((a, b) => {
              const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
              if (dateComparison !== 0) return dateComparison;
              return a.startTime.localeCompare(b.startTime);
            });
          }
          this.currentPage = 1;
        } finally {
          this.loading = false;
        }
      },
      error: (error) => {
        this.toastService.showError('Error loading time slots');
      }
    });
  }

  createAvailability() {
    if (this.availabilityForm.valid) {
      const rawFormData = this.availabilityForm.value;
      const formData: CreateAvailabilityRequest = {
        dayOfWeek: Number(rawFormData.dayOfWeek),
        startTime: rawFormData.startTime,
        endTime: rawFormData.endTime,
        slotDuration: Number(rawFormData.slotDuration),
        isActive: true
      };
      console.log('Creating availability with data:', formData);
      if (isNaN(formData.dayOfWeek) || formData.dayOfWeek < 0 || formData.dayOfWeek > 6) {
        this.toastService.showWarning('Please select a valid day of the week');
        return;
      }
      if (isNaN(formData.slotDuration) || formData.slotDuration < 15 || formData.slotDuration > 120) {
        this.toastService.showWarning('Slot duration must be between 15 and 120 minutes');
        return;
      }
      this.loading = true;
      this.availabilityService.createAvailability(formData).subscribe({
        next: (response) => {
          console.log('Create availability response:', response);
          this.availabilityForm.reset();
          this.availabilityForm.patchValue({
            startTime: '09:00',
            endTime: '17:00',
            slotDuration: 30
          });
          this.toastService.showSuccess('Availability created successfully');
          this.loading = false;
          this.loadAvailabilities();
          this.notifyAdminOfChanges();
        },
        error: (error) => {
          console.error('Error creating availability:', error);
          this.loading = false;
          this.toastService.showError('Error creating availability. Please try again.');
        }
      });
    } else {
      console.log('Form is invalid:', this.availabilityForm.errors);
      this.toastService.showWarning('Please fill all required fields correctly');
    }
  }

  generateTimeSlots() {
    if (this.generateSlotsForm.valid) {
      this.loading = true;
      const { startDate, endDate } = this.generateSlotsForm.value;
      console.log('Generating time slots with:', { startDate, endDate });
      const formattedStartDate = startDate.toISOString().split('T')[0];
      const formattedEndDate = endDate.toISOString().split('T')[0];
      console.log(`Formatted dates: ${formattedStartDate} to ${formattedEndDate}`);
      this.availabilityService.generateTimeSlots(formattedStartDate, formattedEndDate)
        .subscribe({
          next: (response) => {
            console.log('Generate slots response:', response);
            this.loading = false;
            let slots = [];
            let message = 'Time slots generated successfully';
            if (response) {
              if (response.data && Array.isArray(response.data)) {
                slots = response.data;
                message = response.message || `Generated ${slots.length} time slots`;
              } else if (Array.isArray(response)) {
                slots = response;
                message = `Generated ${slots.length} time slots`;
              }
            }
            this.toastService.showSuccess(message);
            setTimeout(() => {
              this.loadTimeSlots();
              this.notifyAdminOfChanges();
            }, 1000);
          },
          error: (error) => {
            console.error('Error generating time slots:', error);
            this.loading = false;
            this.toastService.showError('Error generating time slots. Please try again.');
          }
        });
    } else {
      this.toastService.showWarning('Please select valid start and end dates');
    }
  }

  manualRefresh() {
    console.log('Manual refresh requested');
    this.toastService.showInfo('Refreshing availability data...');
    try {
      localStorage.removeItem('adminScheduleUpdate');
      localStorage.removeItem('admin_availability_update');
    } catch (e) {
      console.warn('Failed to clear admin notifications:', e);
    }
    this.loadAvailabilities();
    this.loadTimeSlots();
    this.checkForAdminChanges();
    console.log('Manual refresh completed - data synchronized');
  }

  checkForAdminChanges() {
    const adminUpdate = localStorage.getItem('adminScheduleUpdate');
    if (adminUpdate) {
      try {
        const notification = JSON.parse(adminUpdate);
        const currentPractitionerId = this.availabilityService.getCurrentPractitionerId();
        if (notification.practitionerId === currentPractitionerId) {
          localStorage.removeItem('adminScheduleUpdate');
          this.toastService.showInfo('Admin made changes. Refreshing data...');
          this.forceReloadFromAdmin();
          return true;
        }
      } catch (e) {
        console.error('Error parsing admin notification:', e);
      }
    }
    return false;
  }

  forceReloadFromAdmin() {
    console.log('Force reloading data due to admin changes...');
    this.timeSlots = [];
    this.availabilities = [];
    try {
      localStorage.removeItem('adminScheduleUpdate');
      localStorage.removeItem('admin_availability_update');
    } catch (e) {
      console.warn('Failed to clear notifications:', e);
    }
    this.loading = true;
    this.toastService.showInfo('Syncing with admin changes...');
    this.loadAvailabilities();
    setTimeout(() => {
      this.loadTimeSlots();
      setTimeout(() => {
        this.loading = false;
        console.log('Admin sync completed successfully');
        this.toastService.showSuccess('Data synchronized with admin changes');
      }, 2000);
    }, 1500);
  }

  notifyAdminOfChanges() {
    const notification = {
      type: 'PRACTITIONER_UPDATE',
      practitionerId: this.availabilityService.getCurrentPractitionerId(),
      timestamp: Date.now(),
      message: 'Practitioner made changes'
    };
    localStorage.setItem('practitionerScheduleUpdate', JSON.stringify(notification));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'practitionerScheduleUpdate',
      newValue: JSON.stringify(notification)
    }));
    console.log('Notified admin of practitioner changes:', notification);
  }

  deleteAvailability(id: number) {
    if (confirm('Are you sure you want to delete this availability?')) {
      this.availabilityService.deleteAvailability(id).subscribe({
        next: () => {
          this.availabilities = this.availabilities.filter(a => a.id !== id);
          this.toastService.showSuccess('Availability deleted successfully');
          this.notifyAdminOfChanges();
        },
        error: (error) => {
          console.error('Error deleting availability:', error);
          this.toastService.showError('Error deleting availability');
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
        this.toastService.showSuccess(`Availability ${updatedAvailability.isActive ? 'enabled' : 'disabled'}`);
        this.notifyAdminOfChanges();
      },
      error: (error) => {
        this.toastService.showError('Error updating availability');
      }
    });
  }

  toggleSlotStatus(slot: TimeSlot) {
    const newStatus = slot.status === 'AVAILABLE' ? 'BLOCKED' : 'AVAILABLE';
    this.availabilityService.updateSlotStatus(slot.id, newStatus).subscribe({
      next: (updatedSlot) => {
        const index = this.timeSlots.findIndex(s => s.id === slot.id);
        if (index !== -1) {
          this.timeSlots[index] = updatedSlot;
        }
        this.toastService.showSuccess(`Slot ${newStatus.toLowerCase()}`);
        this.notifyAdminOfChanges();
      },
      error: (error) => {
        this.toastService.showError('Error updating slot');
      }
    });
  }

  deleteSlot(slotId: number) {
    if (confirm('Are you sure you want to delete this time slot?')) {
      this.availabilityService.deleteTimeSlot(slotId).subscribe({
        next: () => {
          this.timeSlots = this.timeSlots.filter(slot => slot.id !== slotId);
          this.toastService.showSuccess('Time slot deleted successfully');
          this.notifyAdminOfChanges();
        },
        error: (error) => {
          this.toastService.showError('Error deleting time slot');
        }
      });
    }
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

  get pagedTimeSlots(): TimeSlot[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return this.timeSlots.slice(startIndex, startIndex + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.timeSlots.length / this.pageSize);
  }

  timeRangeValidator(control: any) {
    const startTime = control.get('startTime')?.value;
    const endTime = control.get('endTime')?.value;
    if (startTime && endTime) {
      const start = new Date(`2000-01-01T${startTime}`);
      const end = new Date(`2000-01-01T${endTime}`);
      if (start >= end) {
        return { timeRange: true };
      }
    }
    return null;
  }

  ngOnDestroy() {
    if (this.onDestroy) {
      this.onDestroy();
    }
  }
}

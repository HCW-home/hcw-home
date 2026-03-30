import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface Practitioner {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface Availability {
  id: number;
  practitionerId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive: boolean;
  practitioner?: Practitioner;
}

@Component({
  selector: 'app-availability',
  templateUrl: './availability.component.html',
  styleUrls: ['./availability.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule]
})
export class AvailabilityComponent implements OnInit {
  availabilityForm: FormGroup;
  availabilities: Availability[] = [];
  practitioners: Practitioner[] = [];
  isLoading = false;
  editingId: number | null = null;

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
    private http: HttpClient
  ) {
    this.availabilityForm = this.fb.group({
      practitionerId: ['', Validators.required],
      dayOfWeek: ['', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      slotDuration: [30, [Validators.required, Validators.min(15), Validators.max(120)]],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.loadPractitioners();
    this.loadAvailabilities();
  }

  private getAuthHeaders() {
    const userJson = localStorage.getItem('currentUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const token = user?.accessToken;
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  async loadPractitioners(): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      const response = await this.http.get<any>(`${environment.apiUrl}/user/role/practitioners`, { headers }).toPromise();
      this.practitioners = response?.data || [];
    } catch (error) {
      console.error('Failed to load practitioners', error);
      this.practitioners = [];
    }
  }

  async loadAvailabilities(): Promise<void> {
    this.isLoading = true;
    try {
      const headers = this.getAuthHeaders();
      const response = await this.http.get<any>(`${environment.apiUrl}/availability/all`, { headers }).toPromise() || [];
      this.availabilities = response?.data || []
    } catch (error) {
      console.error('Failed to load availabilities', error);
      this.availabilities = [];
    } finally {
      this.isLoading = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.availabilityForm.valid) {
      try {
        const rawValue = this.availabilityForm.value;
        const formData = {
          ...rawValue,
          practitionerId: Number(rawValue.practitionerId),
          dayOfWeek: Number(rawValue.dayOfWeek),
        };

        const headers = this.getAuthHeaders();
        
        if (this.editingId) {
          await this.http.patch(`${environment.apiUrl}/availability/${this.editingId}`, formData, { headers }).toPromise();
          console.log('Availability updated successfully');
        } else {
          console.log("Creating new availability...");
          await this.http.post(`${environment.apiUrl}/availability`, formData, { headers }).toPromise();
          console.log('Availability created successfully');
        }
        
        this.resetForm();
        this.loadAvailabilities();
      } catch (error) {
        console.error('Failed to save availability', error);
        alert('Error saving availability. Please check the console for details.');
      }
    } else {
      console.log('Form is invalid:', this.availabilityForm.errors);
      alert('Please fill in all required fields correctly.');
    }
  }

  editAvailability(availability: Availability): void {
    this.editingId = availability.id;
    this.availabilityForm.patchValue({
      practitionerId: availability.practitionerId,
      dayOfWeek: availability.dayOfWeek,
      startTime: availability.startTime,
      endTime: availability.endTime,
      slotDuration: availability.slotDuration,
      isActive: availability.isActive
    });
  }

  async deleteAvailability(id: number): Promise<void> {
    if (confirm('Are you sure you want to delete this availability?')) {
      try {
        await this.http.delete(`${environment.apiUrl}/availability/${id}`).toPromise();
        this.loadAvailabilities();
      } catch (error) {
        console.error('Failed to delete availability', error);
      }
    }
  }

  async generateTimeSlots(practitionerId: number): Promise<void> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    try {
      await this.http.post(`${environment.apiUrl}/availability/generate-slots/${practitionerId}`, null, {
        params: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }
      }).toPromise();

    } catch (error) {
      console.error('Failed to generate time slots', error);
    }
  }

  resetForm(): void {
    this.availabilityForm.reset();
    this.availabilityForm.patchValue({ slotDuration: 30, isActive: true });
    this.editingId = null;
  }

  getDayName(dayOfWeek: number): string {
    return this.daysOfWeek.find(day => day.value === dayOfWeek)?.label || '';
  }

  getPractitionerName(practitionerId: number): string {
    const practitioner = this.practitioners.find(p => p.id === practitionerId);
    return practitioner ? `${practitioner.firstName} ${practitioner.lastName}` : '';
  }
}

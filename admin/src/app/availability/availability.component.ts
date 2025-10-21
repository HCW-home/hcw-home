import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

interface Practitioner {
  id: number;
  firstName: string;
  lastName?: string;
  email?: string;
}

interface Availability {
  id: number;
  practitionerId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive?: boolean;
}

interface DayAvailability {
  dayOfWeek: number;
  date: string;
  isWorkingDay: boolean;
  availableTimes: any[];
  appointments: any[];
  totalSlots: number;
  bookedSlots: number;
}
@Component({
  selector: 'app-availability',
  templateUrl: './availability.component.html',
  styleUrls: ['./availability.component.scss'],
  // include commonly used directives so template compilation can resolve *ngFor/*ngIf and reactive forms
  imports: [CommonModule, ReactiveFormsModule]
})
export class AvailabilityComponent implements OnInit {
  availabilityForm: FormGroup;
  timeSlotForm: FormGroup;
  practitioners: any[] = [];
  organizations: any[] = [];
  patients: any[] = [];
  availabilities: any[] = [];
  weeklySchedule: any[] = [];
  weekStart: Date = new Date();
  weekEnd: Date = new Date();
  weekStats: any = { workingDays: 0, availableSlots: 0, bookedSlots: 0, freeSlots: 0 };
  isLoading = false;
  editingId: number | null = null;
  editingSlot: any = null;
  selectedDoctorId: number | null = null;
  timeSlots: any[] = [];

  constructor(private fb: FormBuilder, private http: HttpClient, private snackBar: MatSnackBar) {
    // Initialize forms
    this.availabilityForm = this.fb.group({
      practitionerId: ['', Validators.required],
      dayOfWeek: ['', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      slotDuration: [30, [Validators.required, Validators.min(15), Validators.max(120)]],
      isActive: [true]
    });

    this.timeSlotForm = this.fb.group({
      dayOfWeek: ['', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      slotDuration: [30, [Validators.required, Validators.min(15), Validators.max(120)]]
    });
  }

  // human-friendly mapping for weekdays (used in templates)
  daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  // Helpers to extract created/updated id from different response shapes
  private getCreatedIdFromResponse(res: any): number | null {
    if (!res) return null;
    if (typeof res === 'number') return res;
    if (res.id) return Number(res.id);
    if (res.data && res.data.id) return Number(res.data.id);
    if (res.data && res.data.data && res.data.data.id) return Number(res.data.data.id);
    // some responses nest the object directly under 'data'
    if (res.data && typeof res.data === 'object' && res.data.requestId && res.data.availability) {
      return Number(res.data.availability.id || null);
    }
    return null;
  }

  ngOnInit(): void {
    this.loadPractitioners();
    this.loadOrganizations();
    this.initializeWeekRange();
    this.loadWeeklySchedule();
    
    // Set up listener for practitioner changes
    this.setupPractitionerListener();
  }

  setupPractitionerListener() {
    // Listen for practitioner updates
    window.addEventListener('storage', (event) => {
      if (event.key === 'practitionerScheduleUpdate' && event.newValue) {
        try {
          const notification = JSON.parse(event.newValue);
          if (notification.practitionerId === this.selectedDoctorId) {
            console.log('Received practitioner update notification:', notification);
            this.snackBar.open('Practitioner made changes. Refreshing data...', 'Close', { duration: 3000 });
            
            // Clear the notification and refresh data
            localStorage.removeItem('practitionerScheduleUpdate');
            setTimeout(() => {
              this.loadWeeklySchedule();
            }, 1000);
          }
        } catch (e) {
          console.error('Error handling practitioner sync:', e);
        }
      }
    });
  }

  private getAuthHeaders() {
    // Try to get token from both possible locations
    let token = localStorage.getItem('authToken');
    if (!token) {
      const userJson = localStorage.getItem('currentUser');
      const user = userJson ? JSON.parse(userJson) : null;
      token = user?.tokens?.accessToken || user?.token;
    }
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }

  // Notify practitioner clients (other tabs/windows) about availability updates
  private notifyPractitionerUpdate(practitionerId: number): void {
    try {
      // Multiple notification strategies for redundancy
      
      // 1. Use localStorage for older browsers and cross-tab communication
      const key = `availability_update_practitioner_${practitionerId}`;
      // write a timestamp so storage event fires
      const timestamp = Date.now();
      localStorage.setItem(key, String(timestamp));
      
      // 2. Also set a global update key that all practitioners will notice
      localStorage.setItem('availability_global_update', String(timestamp));
      
      // 3. Use a direct key that matches exactly what the practitioner component is watching for
      localStorage.setItem('admin_availability_update', JSON.stringify({
        practitionerId,
        timestamp,
        date: new Date().toISOString()
      }));
      
      // 3. Use BroadcastChannel for modern browsers - more reliable immediate cross-tab notification
      try {
        const bc = new BroadcastChannel('availability_updates');
        bc.postMessage({ 
          practitionerId, 
          ts: timestamp,
          type: 'update',
          source: 'admin'
        });
        // Close after a slight delay to ensure message is sent
        setTimeout(() => bc.close(), 100);
      } catch (e) {
        console.log('BroadcastChannel not available - relying on localStorage event');
      }
      
      // Log success
      console.log(`Practitioner notification sent for ID: ${practitionerId} at ${new Date(timestamp).toISOString()}`);
    } catch (e) {
      console.warn('notifyPractitionerUpdate failed', e);
    }
  }

  private handleError(error: HttpErrorResponse) {
    console.error('HTTP Error:', error);
    if (error.status === 0) {
      // Network error
      return throwError('Network connection failed. Please check your connection.');
    } else if (error.status >= 400 && error.status < 500) {
      // Client error
      return throwError(`Client error: ${error.message}`);
    } else if (error.status >= 500) {
      // Server error
      return throwError(`Server error: ${error.message}`);
    } else {
      // Other error
      return throwError(`An error occurred: ${error.message}`);
    }
  }

  async loadPractitioners(): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      console.log('Loading practitioners...');
      
      // First try the role/practitioners endpoint
      try {
        const response = await this.http.get<any>(`${environment.apiUrl}/user/role/practitioners`, { headers })
          .pipe(
            timeout(10000), // 10 second timeout
            catchError(this.handleError.bind(this))
          )
          .toPromise();
        this.practitioners = response?.data || [];
        console.log('Loaded practitioners from role endpoint:', this.practitioners.length);
      } catch (roleError) {
        console.error('Failed to load from role endpoint, trying users endpoint', roleError);
        
        // Fallback to the user endpoint with role filter
        const response = await this.http.get<any>(`${environment.apiUrl}/user`, { 
          headers,
          params: { role: 'PRACTITIONER' }
        })
        .pipe(
          timeout(10000), // 10 second timeout
          catchError(this.handleError.bind(this))
        )
        .toPromise();
        
        this.practitioners = response?.data || [];
        console.log('Loaded practitioners from users endpoint:', this.practitioners.length);
      }
    } catch (error) {
      console.error('Failed to load practitioners from all endpoints', error);
      this.practitioners = [];
      this.snackBar.open('Failed to load practitioners. Please check backend connection.', 'Close', { duration: 5000 });
    }
  }

  async loadAvailabilities(): Promise<void> {
    this.isLoading = true;
    try {
      console.log('Loading availabilities...');
      const headers = this.getAuthHeaders();
      
      const response = await this.http.get<any>(`${environment.apiUrl}/availability/all`, { headers })
        .pipe(
          timeout(10000), // 10 second timeout
          catchError(this.handleError.bind(this))
        )
        .toPromise();
      
      // Handle different response formats
      if (Array.isArray(response)) {
        this.availabilities = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        this.availabilities = response.data;
      } else {
        this.availabilities = [];
      }
      
      console.log('Loaded availabilities:', this.availabilities.length);
    } catch (error) {
      console.error('Failed to load availabilities', error);
      this.availabilities = [];
      this.snackBar.open('Failed to load availabilities - using offline mode', 'Close', { duration: 3000 });
    } finally {
      this.isLoading = false;
      this.computeWeekStats();
    }
  }

  initializeWeekRange() {
    const now = new Date();
    // start on Monday of current week
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7; // Monday=1
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    this.weekStart = monday;
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    this.weekEnd = sunday;
    this.computeWeekStats();
  }

  changeWeek(offset: number) {
    this.weekStart.setDate(this.weekStart.getDate() + offset * 7);
    this.weekEnd.setDate(this.weekEnd.getDate() + offset * 7);
    // force new Dates to trigger change detection in Angular templates
    this.weekStart = new Date(this.weekStart);
    this.weekEnd = new Date(this.weekEnd);
    this.computeWeekStats();
    // reload schedule for the newly selected week
    this.loadWeeklySchedule();
  }

  formatWeekRange(): string {
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return `${this.weekStart.toLocaleDateString('en-GB', opts)} - ${this.weekEnd.toLocaleDateString('en-GB', opts)}`;
  }

  async loadOrganizations(): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      const response = await this.http.get<any>(`${environment.apiUrl}/organization`, { headers }).toPromise();
      if (Array.isArray(response)) {
        this.organizations = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        this.organizations = response.data;
      } else {
        this.organizations = [];
      }
    } catch (error) {
      console.error('Failed to load organizations', error);
      // Fallback data for testing
      this.organizations = [
        { id: 1, name: 'Al Fanar Medical Center' },
        { id: 2, name: 'City Hospital' },
        { id: 3, name: 'General Clinic' }
      ];
    }
  }

  async loadPatientsForOrganization(orgId: number | null): Promise<void> {
    try {
      if (!orgId) {
        this.patients = [];
        return;
      }
      const headers = this.getAuthHeaders();
      const response = await this.http.get<any>(`${environment.apiUrl}/user`, { headers, params: { role: 'PATIENT', organizationId: String(orgId) } }).toPromise();
      if (Array.isArray(response)) {
        this.patients = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        this.patients = response.data;
      } else {
        this.patients = [];
      }
    } catch (error) {
      console.error('Failed to load patients', error);
      this.patients = [];
    }
  }

  async onOrganizationChange(event: any) {
    const orgId = Number(event.target.value) || null;
    await this.loadPatientsForOrganization(orgId);
    // optionally reset selected practitioner/time slots view
    this.selectedPractitionerId = null;
    this.timeSlots = [];
  }

  async onPatientChange(event: any) {
    const patientId = Number(event.target.value) || null;
    // TODO: use patientId to filter week stats or other data if backend supports it
    // For now just recompute stats (placeholder)
    this.computeWeekStats();
  }

  computeWeekStats() {
    // Basic computation based on loaded availabilities and timeSlots.
    // This is a lightweight, client-side approximation until backend provides a dedicated endpoint.
    const start = this.weekStart;
    const end = this.weekEnd;
    const availabilitiesInWeek = this.availabilities.filter(a => {
      // keep all availabilities since they are dayOfWeek-based
      return a.isActive;
    });

    // Working days = count of unique dayOfWeek values that have active availability
    const workingDaysSet = new Set<number>();
    let totalSlots = 0;
    let booked = 0;

    // If timeSlots loaded, use them to compute slots/booked
    if (Array.isArray(this.timeSlots) && this.timeSlots.length > 0) {
      for (const slot of this.timeSlots) {
        const slotDate = new Date(slot.date);
        if (slotDate >= start && slotDate <= end) {
          totalSlots++;
          if (slot.status === 'BOOKED') booked++;
          const dow = slotDate.getDay();
          workingDaysSet.add(dow);
        }
      }
    } else {
      // Fallback: estimate slots from availabilities by dayOfWeek for the current week only
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const availability = availabilitiesInWeek.find(a => a.dayOfWeek === dayOfWeek && a.isActive);
        
        if (availability) {
          workingDaysSet.add(dayOfWeek);
          // Calculate number of slots for this specific day
          try {
            const [sh, sm] = availability.startTime.split(':').map(Number);
            const [eh, em] = availability.endTime.split(':').map(Number);
            const startMinutes = sh * 60 + sm;
            const endMinutes = eh * 60 + em;
            const duration = availability.slotDuration || 30;
            if (endMinutes > startMinutes) {
              const slotsForThisDay = Math.max(0, Math.floor((endMinutes - startMinutes) / duration));
              totalSlots += slotsForThisDay;
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    }

    this.weekStats.workingDays = workingDaysSet.size;
    this.weekStats.availableSlots = totalSlots;
    this.weekStats.bookedSlots = booked;
    this.weekStats.freeSlots = Math.max(0, totalSlots - booked);
  }

  async onSubmit(): Promise<void> {
    if (this.availabilityForm.valid) {
      try {
        const formData = this.availabilityForm.value;
        console.log('Submitting availability form:', formData);
        
        const headers = this.getAuthHeaders();
        
        if (this.editingId) {
          await this.http.patch(`${environment.apiUrl}/availability/${this.editingId}`, formData, { headers })
            .pipe(
              timeout(15000), // 15 second timeout for updates
              catchError(this.handleError.bind(this))
            )
            .toPromise();
          console.log('Availability updated successfully');
          this.snackBar.open('Availability updated successfully', 'Close', { duration: 3000 });
        } else {
          await this.http.post(`${environment.apiUrl}/availability`, formData, { headers })
            .pipe(
              timeout(15000), // 15 second timeout for creation
              catchError(this.handleError.bind(this))
            )
            .toPromise();
          console.log('Availability created successfully');
          this.snackBar.open('Availability created successfully', 'Close', { duration: 3000 });
        }
        
        this.resetForm();
        await this.loadAvailabilities();
        
        // Force browser cache clear for practitioner sync
        this.clearPractitionerCache();
        
        // Notify about practitioner sync
        this.snackBar.open('Changes will sync to practitioner portal automatically', 'Close', { duration: 5000 });
        
      } catch (error) {
        console.error('Failed to save availability', error);
        this.snackBar.open('Error saving availability. Please try again.', 'Close', { duration: 5000 });
      }
    } else {
      console.log('Form is invalid:', this.availabilityForm.errors);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', { duration: 3000 });
    }
  }

  private clearPractitionerCache(): void {
    // Clear localStorage cache that might affect practitioner data sync
    try {
      // Remove any cached availability data that might conflict
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.includes('availability') || key.includes('timeSlots') || key.includes('practitioner')) {
          // Only clear cache data, not authentication data
          if (!key.includes('authToken') && !key.includes('currentUser')) {
            localStorage.removeItem(key);
          }
        }
      });
      console.log('Cleared practitioner cache to ensure data sync');
    } catch (error) {
      console.warn('Failed to clear cache:', error);
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

  async deleteAvailability(id?: number): Promise<void> {
    if (!id) {
      this.snackBar.open('No availability id provided to delete', 'Close', { duration: 3000 });
      return;
    }

    if (confirm('Are you sure you want to delete this availability?')) {
      try {
        const headers = this.getAuthHeaders();
        await this.http.delete(`${environment.apiUrl}/availability/${id}`, { headers })
          .pipe(
            timeout(10000), // 10 second timeout
            catchError(this.handleError.bind(this))
          )
          .toPromise();
        
        this.snackBar.open('Availability deleted successfully', 'Close', { duration: 3000 });
        // reload availabilities and weekly schedule to reflect change
        await this.loadAvailabilities();
        await this.loadWeeklySchedule();
        
        // Notify practitioner about the update if a doctor is selected
        if (this.selectedDoctorId) {
          try { 
            this.notifyPractitionerUpdate(this.selectedDoctorId); 
          } catch (e) { 
            console.warn('Failed to notify practitioner about availability deletion', e); 
          }
        }
      } catch (error) {
        console.error('Failed to delete availability', error);
        this.snackBar.open('Failed to delete availability', 'Close', { duration: 3000 });
      }
    }
  }

  openTimeSlotModal(dayObj: any, slotObj: any): void {
    try {
      const dateIso = (dayObj?.date) ? dayObj.date : null;
      // find dayIndex by date match
      let dayIndex = -1;
      if (dateIso) {
        dayIndex = this.weeklySchedule.findIndex(d => d.date === dateIso);
      }

      if (dayIndex === -1 && dayObj && typeof dayObj.dayOfWeek === 'number') {
        // fallback: match by dayOfWeek mapping relative to weekStart
        dayIndex = this.weeklySchedule.findIndex(d => d.dayOfWeek === dayObj.dayOfWeek);
      }

      if (dayIndex === -1) {
        // fallback: try to match by object reference
        dayIndex = this.weeklySchedule.findIndex(d => d === dayObj);
      }

      if (dayIndex === -1) {
        console.warn('Could not determine day index for openTimeSlotModal', dayObj);
        return;
      }

      const slotIndex = this.weeklySchedule[dayIndex].availableTimes.findIndex((s: any) => {
        if (!s || !slotObj) return false;
        return (s.startTime === slotObj.startTime && s.endTime === slotObj.endTime && Number(s.slotDuration) === Number(slotObj.slotDuration));
      });

      if (slotIndex === -1) {
        // if no match, open add modal for this day
        this.addTimeSlot(dayIndex);
        return;
      }

      // found indices — open edit modal via existing method
      this.editTimeSlot(dayIndex, slotIndex);
    } catch (e) {
      console.error('openTimeSlotModal error', e);
    }
  }

  async generateTimeSlots(practitionerId: number): Promise<void> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    try {
      const headers = this.getAuthHeaders();
      await this.http.post(`${environment.apiUrl}/availability/generate-slots/${practitionerId}`, null, {
        headers,
        params: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }
      })
      .pipe(
        timeout(20000), // 20 second timeout for slot generation
        catchError(this.handleError.bind(this))
      )
      .toPromise();
      
      this.snackBar.open('Time slots generated successfully', 'Close', { duration: 3000 });
      // Load the time slots for this practitioner
      await this.viewPractitionerSlots(practitionerId);
      // Notify practitioner clients
      try { this.notifyPractitionerUpdate(practitionerId); } catch (e) { console.warn('notify failed', e); }
    } catch (error) {
      console.error('Failed to generate time slots', error);
      this.snackBar.open('Failed to generate time slots - please try again', 'Close', { duration: 3000 });
    }
  }
  
  selectedPractitionerId: number | null = null;
  viewingSlotsFor: string = '';
  
  async viewPractitionerSlots(practitionerId: number): Promise<void> {
    this.selectedPractitionerId = practitionerId;
    const practitioner = this.practitioners.find(p => p.id === practitionerId);
    this.viewingSlotsFor = practitioner ? `${practitioner.firstName} ${practitioner.lastName}` : '';
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    
    try {
      // Retry loop to handle transient 429 (Too Many Requests) or network glitches
      let attempts = 0;
      let response: any = null;
      const maxAttempts = 3;
      const params = {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };

      while (attempts < maxAttempts) {
        try {
          response = await this.http.get<any>(`${environment.apiUrl}/availability/slots/${practitionerId}`, {
            headers: this.getAuthHeaders(),
            params
          }).toPromise();
          break; // success
        } catch (err: any) {
          attempts++;
          const status = err?.status;
          // if rate limited, wait a bit and retry
          if (status === 429 && attempts < maxAttempts) {
            const backoffMs = 500 * attempts; // simple backoff
            console.warn(`Received 429, retrying after ${backoffMs}ms (attempt ${attempts})`);
            await new Promise(res => setTimeout(res, backoffMs));
            continue;
          }
          // non-retryable or out of attempts, rethrow
          throw err;
        }
      }
      // Normalize different possible response shapes
      let slotsArray: any[] = [];
      if (Array.isArray(response)) {
        slotsArray = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        slotsArray = response.data;
      } else if (response && Array.isArray((response as any).data?.data)) {
        // Some wrappers nest data twice
        slotsArray = (response as any).data.data;
      } else {
        // Fallback: try to coerce to array or empty
        slotsArray = [];
      }

  this.timeSlots = slotsArray;

      // Sort only if it's an array and elements have date/startTime
      if (Array.isArray(this.timeSlots) && typeof this.timeSlots.sort === 'function') {
        this.timeSlots.sort((a: any, b: any) => {
          const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (dateComparison !== 0) return dateComparison;
          return String(a.startTime).localeCompare(String(b.startTime));
        });
      }
      // recompute stats when time slots are loaded
      this.computeWeekStats();
    } catch (error) {
      console.error('Failed to load time slots', error);
      this.timeSlots = [];
      this.snackBar.open('Failed to load time slots', 'Close', { duration: 3000 });
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

  getWeekdayLabel(dateString: string): string {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('en-US', { weekday: 'long' });
    } catch (e) {
      return '';
    }
  }

  getPractitionerName(practitionerId: number): string {
    // First check if a practitioner object is embedded in availabilities
    const byEmbedded = this.availabilities.find(a => a.practitioner && a.practitioner.id === practitionerId);
    if (byEmbedded && byEmbedded.practitioner) {
      return `${byEmbedded.practitioner.firstName} ${byEmbedded.practitioner.lastName}`;
    }

    const practitioner = this.practitioners.find(p => p.id === practitionerId);
    return practitioner ? `${practitioner.firstName} ${practitioner.lastName}` : '';
  }
  
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatTime(timeString: string): string {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  // Map slot status to CSS class names used by the template
  getSlotStatusClass(status: string): string {
    switch (status) {
      case 'AVAILABLE':
        return 'status-available';
      case 'BOOKED':
        return 'status-booked';
      case 'BLOCKED':
        return 'status-blocked';
      default:
        return '';
    }
  }

  // New weekly calendar methods
  async loadWeeklySchedule(): Promise<void> {
    if (!this.selectedDoctorId) {
      this.weeklySchedule = this.generateEmptyWeekSchedule();
      this.calculateWeekStats();
      return;
    }

    this.isLoading = true;
    try {
      const headers = this.getAuthHeaders();
      
      console.log('Loading weekly schedule for doctor:', this.selectedDoctorId, 'week:', this.formatWeekRange());
      
      // Load availabilities for the selected doctor using the same endpoint as practitioner component
      let availabilities: any[] = [];
      try {
        const availResponse = await this.http.get<any>(`${environment.apiUrl}/availability/practitioner/${this.selectedDoctorId}`, {
          headers
        })
        .pipe(
          timeout(10000), // 10 second timeout
          catchError(this.handleError.bind(this))
        )
        .toPromise();

        // Handle the response format consistently with practitioner component
        console.log('Raw availabilities response for practitioner:', availResponse);

        if (Array.isArray(availResponse)) {
          availabilities = availResponse;
        } else if (Array.isArray(availResponse?.data)) {
          availabilities = availResponse.data;
        } else if (Array.isArray(availResponse?.data?.data)) {
          availabilities = availResponse.data.data;
        } else if (Array.isArray(availResponse?.availability)) {
          availabilities = availResponse.availability;
        } else if (Array.isArray(availResponse?.data?.availability)) {
          availabilities = availResponse.data.availability;
        } else if (availResponse && typeof availResponse === 'object') {
          // try to coerce to an array if possible
          const candidate = availResponse.data || availResponse.availability || availResponse.result || null;
          if (Array.isArray(candidate)) availabilities = candidate;
        }

        console.log('Normalized availabilities for practitioner:', this.selectedDoctorId, availabilities);
      } catch (error) {
        console.warn('Could not load availabilities from practitioner endpoint, using fallback');
        // Fallback: try to load all availabilities and filter
        try {
          const allAvail = await this.http.get<any>(`${environment.apiUrl}/availability/all`, { headers })
            .pipe(
              timeout(10000), // 10 second timeout
              catchError(this.handleError.bind(this))
            )
            .toPromise();
          const allAvailabilities = Array.isArray(allAvail) ? allAvail : (allAvail?.data || []);
          availabilities = allAvailabilities.filter((a: any) => a.practitionerId === this.selectedDoctorId);
        } catch (fallbackError) {
          console.error('Could not load availabilities:', fallbackError);
        }
      }

      // Load time slots using the same endpoint as practitioner component
      let appointments: any[] = [];
      let timeSlotsAll: any[] = [];
      try {
        const slotsResponse = await this.http.get<any>(`${environment.apiUrl}/availability/slots/${this.selectedDoctorId}`, {
          headers,
          params: {
            startDate: this.weekStart.toISOString().split('T')[0],
            endDate: this.weekEnd.toISOString().split('T')[0]
          }
        })
        .pipe(
          timeout(10000), // 10 second timeout
          catchError(this.handleError.bind(this))
        )
        .toPromise();

        console.log('Raw time slots response:', slotsResponse);
        let timeSlots: any[] = [];
        if (Array.isArray(slotsResponse)) {
          timeSlots = slotsResponse;
        } else if (Array.isArray(slotsResponse?.data)) {
          timeSlots = slotsResponse.data;
        } else if (Array.isArray(slotsResponse?.data?.data)) {
          timeSlots = slotsResponse.data.data;
        } else if (Array.isArray(slotsResponse?.slots)) {
          timeSlots = slotsResponse.slots;
        } else if (Array.isArray(slotsResponse?.data?.slots)) {
          timeSlots = slotsResponse.data.slots;
        }

        // keep full set of time slots for use when building schedule (available slots)
        timeSlotsAll = timeSlots;

        // Convert time slots to appointments format (filter only booked ones)
        appointments = timeSlots
          .filter(slot => slot.status === 'BOOKED' && slot.consultation)
          .map(slot => ({
            scheduledDate: slot.date,
            scheduledTime: slot.startTime,
            patient: slot.consultation?.patient || { firstName: 'Unknown', lastName: 'Patient' },
            id: slot.consultation?.id || slot.id
          }));

        console.log('Loaded time slots and converted to appointments:', appointments.length, 'appointments');
      } catch (error) {
        console.warn('Could not load time slots:', error);
      }

      // Pass the full set of time slots to the builder so we can count generated/available slots
      this.weeklySchedule = this.buildWeekSchedule(availabilities, appointments, timeSlotsAll);
      this.calculateWeekStats();
      
      console.log('Weekly schedule built successfully, working days:', this.weekStats.workingDays, 'total slots:', this.weekStats.availableSlots);
    } catch (error) {
      console.error('Failed to load weekly schedule', error);
      this.weeklySchedule = this.generateEmptyWeekSchedule();
      this.calculateWeekStats();
    } finally {
      this.isLoading = false;
    }
  }

  generateEmptyWeekSchedule(): DayAvailability[] {
    const schedule: DayAvailability[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(this.weekStart);
      date.setDate(date.getDate() + i);
      
      schedule.push({
        dayOfWeek: i,
        date: date.toISOString().split('T')[0],
        isWorkingDay: false,
        availableTimes: [],
        appointments: [],
        totalSlots: 0,
        bookedSlots: 0
      });
    }
    
    return schedule;
  }

  buildWeekSchedule(availabilities: any[], appointments: any[], timeSlots: any[] = []): DayAvailability[] {
    const schedule: DayAvailability[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(this.weekStart);
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();
      
      // Find availability for this day - match by dayOfWeek
      const dayAvailabilities = availabilities.filter(a => a.dayOfWeek === dayOfWeek && a.isActive);
      
      // Find appointments for this date
      const dayAppointments = appointments.filter(apt => {
        const aptDate = new Date(apt.scheduledDate || apt.date);
        return aptDate.toDateString() === date.toDateString();
      });

      // If server-generated time slots are available for the date range, use them to compute totals
      const dayIso = date.toISOString().split('T')[0];
      let totalSlots = 0;
      let bookedSlots = 0;
      let availableTimes: any[] = [];

      // find slots for this date (robust: compare iso or toDateString)
      let slotsForDay: any[] = [];
      if (Array.isArray(timeSlots) && timeSlots.length > 0) {
        slotsForDay = timeSlots.filter(s => {
          const sDate = s.date || s.scheduledDate || s.startDate || s.datetime || s.timestamp;
          const iso = this.slotDateToIso(sDate);
          return iso === dayIso;
        });

        totalSlots = slotsForDay.length;
        bookedSlots = slotsForDay.filter(s => (String(s.status).toUpperCase() === 'BOOKED') || !!s.consultation).length;

        // Prefer explicit availability windows if present (include id for edit/delete)
        availableTimes = dayAvailabilities.map(avail => ({
          availabilityId: avail.id,
          startTime: avail.startTime,
          endTime: avail.endTime,
          slotDuration: avail.slotDuration
        }));

        // If no availability records but there are generated slots, derive a simple window
        if (availableTimes.length === 0 && slotsForDay.length > 0) {
          // derive earliest start and latest end robustly
          const parsedStarts: number[] = [];
          const parsedEnds: number[] = [];
          for (const s of slotsForDay) {
            // prefer explicit startTime/endTime fields
            const startStr = s.startTime || s.start || (s.datetime ? new Date(s.datetime).toISOString() : null);
            const endStr = s.endTime || s.end || (s.endDatetime ? new Date(s.endDatetime).toISOString() : null);
            try {
              if (startStr) parsedStarts.push(new Date(startStr).getTime());
              if (endStr) parsedEnds.push(new Date(endStr).getTime());
            } catch (e) {
              // ignore
            }
          }
          const earliestMs = parsedStarts.length ? Math.min(...parsedStarts) : null;
          const latestMs = parsedEnds.length ? Math.max(...parsedEnds) : null;
          const earliest = earliestMs ? new Date(earliestMs).toISOString().split('T')[1].slice(0,5) : (slotsForDay[0].startTime || '00:00');
          const latest = latestMs ? new Date(latestMs).toISOString().split('T')[1].slice(0,5) : (slotsForDay[slotsForDay.length - 1].endTime || '00:00');
          const duration = slotsForDay[0]?.slotDuration || slotsForDay[0]?.duration || 30;
          availableTimes = [{ startTime: earliest, endTime: latest, slotDuration: duration }];
        }
      } else {
        // Fallback to estimating slots from availability records
        totalSlots = 0;
        availableTimes = dayAvailabilities.map(avail => {
          const slots = this.calculateSlots(avail.startTime, avail.endTime, avail.slotDuration);
          // guard against negative or NaN
          const safeSlots = Number.isFinite(slots) && slots > 0 ? slots : 0;
          totalSlots += safeSlots;
          return {
            availabilityId: avail.id,
            startTime: avail.startTime,
            endTime: avail.endTime,
            slotDuration: avail.slotDuration
          };
        });

        // If there are no generated slots, booked slots should be derived from appointments
        // (appointments array may represent bookings for that day)
        bookedSlots = dayAppointments.length;
      }

      const isWorking = (dayAvailabilities.length > 0) || (slotsForDay && slotsForDay.length > 0);

      schedule.push({
        dayOfWeek: i, // This is the index in our weekly view (0-6)
        date: date.toISOString().split('T')[0],
        isWorkingDay: isWorking,
        availableTimes,
        appointments: dayAppointments.map(apt => ({
          time: apt.scheduledTime || apt.time || '00:00',
          patientName: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : (apt.patientName || 'Unknown'),
          appointmentId: apt.id
        })),
        totalSlots,
        bookedSlots
      });
    }
    
    return schedule;
  }

  calculateSlots(startTime: string, endTime: string, slotDuration: number): number {
    try {
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      const totalMinutes = endMinutes - startMinutes;
      return Math.floor(totalMinutes / slotDuration);
    } catch (error) {
      return 0;
    }
  }

  // Normalize various slot date/datetime representations to local YYYY-MM-DD
  private slotDateToIso(sDate: any): string | null {
    if (!sDate) return null;
    try {
      const d = new Date(sDate);
      if (isNaN(d.getTime())) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch (e) {
      return null;
    }
  }

  calculateWeekStats(): void {
    const workingDays = this.weeklySchedule.filter(day => day.isWorkingDay).length;
    const totalSlots = this.weeklySchedule.reduce((sum, day) => sum + day.totalSlots, 0);
    const bookedSlots = this.weeklySchedule.reduce((sum, day) => sum + day.bookedSlots, 0);
    
    this.weekStats = {
      workingDays,
      availableSlots: totalSlots,
      bookedSlots,
      freeSlots: totalSlots - bookedSlots
    };
  }

  async onDoctorChange(event: any): Promise<void> {
    this.selectedDoctorId = Number(event.target.value) || null;
    
    // Reset the schedule and stats
    this.weeklySchedule = [];
    this.weekStats = {
      workingDays: 0,
      availableSlots: 0,
      bookedSlots: 0,
      freeSlots: 0
    };
    
    // Load the schedule for the selected doctor with error handling
    if (this.selectedDoctorId) {
      this.isLoading = true;
      try {
        await this.loadWeeklySchedule();
      } catch (error) {
        console.error('Error loading doctor schedule:', error);
        this.snackBar.open('Error loading doctor schedule - please try again', 'Close', { duration: 3000 });
      } finally {
        this.isLoading = false;
      }
    }
  }

  async toggleWorkingDay(dayIndex: number): Promise<void> {
    if (!this.selectedDoctorId) {
      this.snackBar.open('Please select a doctor first', 'Close', { duration: 3000 });
      return;
    }

    const day = this.weeklySchedule[dayIndex];
    const wasWorkingDay = day.isWorkingDay;
    day.isWorkingDay = !day.isWorkingDay;
    
    if (!day.isWorkingDay) {
      // Remove all availabilities for this day from the UI
      const removedSlots = day.availableTimes.length;
      day.availableTimes = [];
      day.totalSlots = 0;
      
      if (removedSlots > 0) {
        console.log(`Turned off working day ${dayIndex}, removed ${removedSlots} time slots from UI`);
      }
    } else {
      console.log(`Turned on working day ${dayIndex}`);
    }
    
    this.calculateWeekStats();
    
    // Show immediate feedback about the change
    // Calculate the actual dayOfWeek from dayIndex
    const date = new Date(this.weekStart);
    date.setDate(date.getDate() + dayIndex);
    const dayOfWeek = date.getDay();
    const dayName = this.getDayName(dayOfWeek);
    
    if (wasWorkingDay && !day.isWorkingDay) {
      this.snackBar.open(`${dayName} set to Day Off. Click "Save Schedule" to apply changes.`, 'Close', { duration: 4000 });
    } else if (!wasWorkingDay && day.isWorkingDay) {
      this.snackBar.open(`${dayName} set as Working Day. Add time slots and save.`, 'Close', { duration: 4000 });
    }
  }

  async deactivateAvailabilityForDay(dayOfWeek: number): Promise<any> {
    if (!this.selectedDoctorId) {
      return Promise.resolve(null);
    }

    try {
      // Get existing availabilities for this practitioner and day
      const response = await this.http.get<any>(`${environment.apiUrl}/availability/practitioner/${this.selectedDoctorId}`, {
        headers: this.getAuthHeaders()
      }).toPromise();

      let availabilities = [];
      if (response && response.data && Array.isArray(response.data)) {
        availabilities = response.data;
      } else if (Array.isArray(response)) {
        availabilities = response;
      }

      // Find availabilities for this specific day of week
      const dayAvailabilities = availabilities.filter((avail: any) => 
        avail.dayOfWeek === dayOfWeek && avail.isActive
      );

      if (dayAvailabilities.length === 0) {
        console.log(`No active availabilities found for day ${dayOfWeek}`);
        return Promise.resolve(null);
      }

      // Deactivate each availability for this day
      const deactivatePromises = dayAvailabilities.map((avail: any) => {
        console.log(`Deactivating availability ${avail.id} for day ${dayOfWeek}`);
        return this.http.patch(`${environment.apiUrl}/availability/${avail.id}`, 
          { isActive: false }, 
          { headers: this.getAuthHeaders() }
        ).toPromise();
      });

      const results = await Promise.all(deactivatePromises);
      console.log(`Deactivated ${results.length} availabilities for day ${dayOfWeek}`);
      
      // Also remove any existing time slots for this day
      await this.removeTimeSlotsForDay(dayOfWeek);
      
      return results;
    } catch (error) {
      console.error(`Error deactivating availability for day ${dayOfWeek}:`, error);
      throw error;
    }
  }

  async removeTimeSlotsForDay(dayOfWeek: number): Promise<any> {
    if (!this.selectedDoctorId) {
      return Promise.resolve(null);
    }

    try {
      // Calculate date range for this specific day of week in the current week
      const startDate = new Date(this.weekStart);
      const targetDate = new Date(startDate);
      targetDate.setDate(startDate.getDate() + dayOfWeek - startDate.getDay());
      
      // Format as YYYY-MM-DD for the API
      const dateStr = targetDate.toISOString().split('T')[0];
      
      console.log(`Removing time slots for practitioner ${this.selectedDoctorId} on ${dateStr} (day ${dayOfWeek})`);
      
      // Get existing time slots for this practitioner and date
      const response = await this.http.get<any>(`${environment.apiUrl}/availability/slots/${this.selectedDoctorId}`, {
        headers: this.getAuthHeaders(),
        params: {
          startDate: dateStr,
          endDate: dateStr
        }
      }).toPromise();

      let slots = [];
      if (response && response.data && Array.isArray(response.data)) {
        slots = response.data;
      } else if (Array.isArray(response)) {
        slots = response;
      }

      if (slots.length === 0) {
        console.log(`No time slots found for date ${dateStr}`);
        return Promise.resolve(null);
      }

      // Delete each time slot
      const deletePromises = slots.map((slot: any) => {
        console.log(`Deleting time slot ${slot.id} for date ${dateStr}`);
        return this.http.delete(`${environment.apiUrl}/availability/slots/${slot.id}`, {
          headers: this.getAuthHeaders()
        }).toPromise().catch((error: any) => {
          console.error(`Error deleting slot ${slot.id}:`, error);
          return null;
        });
      });

      const deleteResults = await Promise.all(deletePromises);
      console.log(`Deleted ${deleteResults.filter(r => r !== null).length} time slots for day ${dayOfWeek}`);
      return deleteResults;
    } catch (error) {
      console.error(`Error removing time slots for day ${dayOfWeek}:`, error);
      // Don't throw error here, as this is a cleanup operation
      return null;
    }
  }

  notifyPractitionerOfChanges() {
    if (!this.selectedDoctorId) {
      console.log('No practitioner selected for notification');
      return;
    }

    // Use localStorage to notify practitioner app of changes
    const notification = {
      type: 'ADMIN_SCHEDULE_UPDATE',
      practitionerId: this.selectedDoctorId,
      timestamp: Date.now(),
      message: 'Schedule updated by admin',
      adminUserId: this.getCurrentUserId()
    };
    
    // Set multiple notification formats for compatibility
    localStorage.setItem('adminScheduleUpdate', JSON.stringify(notification));
    localStorage.setItem('admin_availability_update', JSON.stringify(notification));
    
    console.log('Notified practitioner of schedule changes:', notification);
    
    // Trigger storage events for cross-tab communication
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'adminScheduleUpdate',
      newValue: JSON.stringify(notification)
    }));

    // Also use BroadcastChannel for better cross-tab communication
    try {
      const bc = new BroadcastChannel('admin-practitioner-sync');
      bc.postMessage({
        type: 'ADMIN_UPDATE',
        practitionerId: this.selectedDoctorId,
        timestamp: Date.now(),
        source: 'admin'
      });
      setTimeout(() => bc.close(), 100);
    } catch (e) {
      console.log('BroadcastChannel not available, using localStorage only');
    }

    // Show confirmation to admin
    this.snackBar.open('Practitioner will be notified of changes', 'Close', { duration: 3000 });
  }

  private getCurrentUserId(): number | null {
    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      return user.id || null;
    } catch (e) {
      return null;
    }
  }

  async addTimeSlot(dayIndex: number): Promise<void> {
    if (!this.selectedDoctorId) {
      this.snackBar.open('Please select a doctor first', 'Close', { duration: 3000 });
      return;
    }

    // Reset form and set up for new slot
    this.timeSlotForm.reset();
    
    // Calculate the actual dayOfWeek for the backend
    const date = new Date(this.weekStart);
    date.setDate(date.getDate() + dayIndex);
    const actualDayOfWeek = date.getDay(); // Sunday = 0, Monday = 1, etc.
    
    // Set up editing state
    this.editingSlot = { 
      dayIndex, 
      isNew: true,
      slotIndex: null,
      availabilityId: null
    };
    
    // Set default form values
    this.timeSlotForm.patchValue({
      dayOfWeek: actualDayOfWeek,
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 30
    });
  }

  async saveTimeSlot(): Promise<void> {
    if (!this.timeSlotForm.valid || !this.selectedDoctorId) return;

    const formData = this.timeSlotForm.value;
    
    try {
      const headers = this.getAuthHeaders();
      
      // Prevent creating availability for past dates
      const editingDayIndex = this.editingSlot?.dayIndex ?? null;
      if (editingDayIndex !== null) {
        const date = new Date(this.weekStart);
        date.setDate(date.getDate() + editingDayIndex);
        const today = new Date();
        today.setHours(0,0,0,0);
        if (date < today) {
          this.snackBar.open('Cannot create availability for past dates', 'Close', { duration: 3000 });
          return;
        }
      }

      // Add practitionerId to the request (same structure as practitioner component)
      const availabilityData = {
        practitionerId: this.selectedDoctorId,
        dayOfWeek: formData.dayOfWeek,
        startTime: formData.startTime,
        endTime: formData.endTime,
        slotDuration: formData.slotDuration,
        isActive: true
      };

      console.log('Sending availability data:', availabilityData);
      
      // If editing an existing availability (we have availabilityId), PATCH instead of POST
      let response: any;
      const editingId = this.editingSlot?.availabilityId || null;
      const isEditingExisting = !this.editingSlot?.isNew && editingId;
      
      if (isEditingExisting) {
        console.log('Updating existing availability with ID:', editingId);
        try {
          response = await this.http.patch(`${environment.apiUrl}/availability/${editingId}`, availabilityData, { headers })
            .pipe(
              timeout(15000), // 15 second timeout
              catchError(this.handleError.bind(this))
            )
            .toPromise();
          console.log('Updated availability via PATCH (raw response):', response);
          this.snackBar.open('Time slot updated successfully', 'Close', { duration: 3000 });
          
          // Notify practitioner of changes
          if (this.selectedDoctorId) this.notifyPractitionerUpdate(this.selectedDoctorId);
        } catch (patchError) {
          console.warn('PATCH failed, attempting POST as fallback:', patchError);
          response = await this.http.post(`${environment.apiUrl}/availability`, availabilityData, { headers })
            .pipe(
              timeout(15000), // 15 second timeout
              catchError(this.handleError.bind(this))
            )
            .toPromise();
          this.snackBar.open('Time slot created successfully', 'Close', { duration: 3000 });
        }
      } else {
        console.log('Creating new availability');
        try {
          response = await this.http.post(`${environment.apiUrl}/availability`, availabilityData, { headers })
            .pipe(
              timeout(15000), // 15 second timeout
              catchError(this.handleError.bind(this))
            )
            .toPromise();
          console.log('Primary endpoint success (created) raw response:', response);
          this.snackBar.open('Time slot created successfully', 'Close', { duration: 3000 });
        } catch (primaryError) {
          console.warn('Primary endpoint failed, trying direct endpoint:', primaryError);
          try {
            response = await this.http.post(`${environment.apiUrl}/availability/direct`, availabilityData, { headers })
              .pipe(
                timeout(15000), // 15 second timeout
                catchError(this.handleError.bind(this))
              )
              .toPromise();
            console.log('Direct endpoint success (raw response):', response);
            this.snackBar.open('Time slot created successfully', 'Close', { duration: 3000 });
          } catch (directError) {
            console.error('Both endpoints failed:', directError);
            throw directError;
          }
        }
      }
      
      // Attach returned id (if any) to local slot and update local schedule immediately so UI reflects changes
      let createdId = this.getCreatedIdFromResponse(response);
      console.log('Created ID extracted from response:', createdId, 'raw response:', response);
      
      // If no id returned, try to fetch practitioner's availabilities and match by values
      if (!createdId && this.selectedDoctorId) {
        try {
          const resp = await this.http.get<any>(`${environment.apiUrl}/availability/practitioner/${this.selectedDoctorId}`, { headers }).toPromise();
          const avails = Array.isArray(resp) ? resp : (resp?.data || []);
          const match = avails.find((a: any) =>
            Number(a.dayOfWeek) === Number(availabilityData.dayOfWeek) &&
            (a.startTime || '').trim() === (availabilityData.startTime || '').trim() &&
            (a.endTime || '').trim() === (availabilityData.endTime || '').trim() &&
            Number(a.slotDuration) === Number(availabilityData.slotDuration)
          );
          if (match) createdId = match.id;
        } catch (e) {
          // ignore lookup failure
        }
      }
      
      // If no ID from server, cannot create slot
      if (!createdId) {
        console.error('No ID from server response, cannot create availability');
        throw new Error('Failed to create availability - no ID returned from server');
      }
      
      try {
        const dayIndex = this.editingSlot?.dayIndex ?? null;
        const slotIndex = this.editingSlot?.slotIndex ?? null;
        console.log('Attaching created id to local schedule. dayIndex:', dayIndex, 'slotIndex:', slotIndex, 'createdId:', createdId);
        
        if (dayIndex !== null) {
          const day = this.weeklySchedule[dayIndex];
          console.log('Day before update:', JSON.parse(JSON.stringify(day)));
          
          if (slotIndex !== null && day && day.availableTimes && day.availableTimes[slotIndex]) {
            const slot = day.availableTimes[slotIndex];
            slot.startTime = availabilityData.startTime;
            slot.endTime = availabilityData.endTime;
            slot.slotDuration = availabilityData.slotDuration;
            if (createdId) slot.availabilityId = createdId;
              // force change detection
              this.weeklySchedule = [...this.weeklySchedule];
            console.log('Updated existing slot');
          } else if (this.editingSlot?.isNew) {
            console.log('Adding new slot to day.availableTimes');
            // newly created slot: push into local schedule so user sees it immediately
            day.availableTimes.push({
              availabilityId: createdId || undefined,
              startTime: availabilityData.startTime,
              endTime: availabilityData.endTime,
              slotDuration: availabilityData.slotDuration
            });
            // recalc day.totalSlots by adding estimated slots
            const added = this.calculateSlots(availabilityData.startTime, availabilityData.endTime, availabilityData.slotDuration);
            day.totalSlots = (day.totalSlots || 0) + added;
            day.isWorkingDay = true;
            // force change detection
            this.weeklySchedule = [...this.weeklySchedule];
            console.log('Added new slot. Day after update:', JSON.parse(JSON.stringify(day)));
          }
        }
      } catch (e) {
        // non-fatal, continue to regenerate slots below
        console.warn('Could not attach returned id to local schedule:', e);
      }

      // Clear the editing state
      this.editingSlot = null;

      // Force immediate UI update by triggering change detection
      this.weeklySchedule = [...this.weeklySchedule];
      this.calculateWeekStats();

      console.log('✅ Save successful, slot should now be visible in UI');
      console.log('📊 Updated weeklySchedule:', this.weeklySchedule);
      
      // Only regenerate if we successfully created on server
      if (createdId && createdId !== Date.now()) {
        console.log('🔄 Regenerating time slots after save...');
        // Wait a bit before regenerating to let UI update first
        setTimeout(async () => {
          await this.generateTimeSlotsForPractitioner();
          console.log('generateTimeSlotsForPractitioner returned, now fetching practitioner slots explicitly...');
          try {
            // Try to load slots via known endpoints to surface them immediately in the UI
            await this.viewPractitionerSlots(this.selectedDoctorId!);
            console.log('viewPractitionerSlots fetched slots after save:', this.timeSlots?.length);
          } catch (e) {
            console.warn('viewPractitionerSlots failed after save:', e);
          }
        }, 500);
        // Also ensure weekly schedule reflects the change even if backend slots are delayed
        try {
          // reload weekly schedule so buildWeekSchedule uses newly-saved availability windows
          await this.loadWeeklySchedule();
          console.log('Weekly schedule reloaded after save to reflect new availability');
        } catch (e) {
          console.warn('Failed to reload weekly schedule after save:', e);
        }
      }

        // Notify practitioner clients that availability changed
        try {
          if (this.selectedDoctorId) this.notifyPractitionerUpdate(this.selectedDoctorId);
        } catch (e) {
          console.warn('Failed to notify practitioner update:', e);
        }
      
      // Don't reload immediately to avoid overwriting local changes
      // setTimeout(async () => {
      //   console.log('Reloading weekly schedule...');
      //   await this.loadWeeklySchedule();
      // }, 1500);
      
    } catch (error: any) {
      console.error('Error saving time slot:', error);
      const errorMessage = error?.error?.message || error?.message || 'Failed to save time slot';
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
    }
  }

  async editTimeSlot(dayIndex: number, slotIndex: number): Promise<void> {
    const day = this.weeklySchedule[dayIndex];
    const slot = day.availableTimes[slotIndex];
    if (!slot) return;

    // Prepare form for editing
    const date = new Date(this.weekStart);
    date.setDate(date.getDate() + dayIndex);
    const actualDayOfWeek = date.getDay();

    this.editingSlot = { 
      dayIndex, 
      slotIndex, 
      isNew: false, 
      availabilityId: slot.availabilityId 
    };

    // If the slot does not carry availabilityId, try to find it from server
    if (!this.editingSlot.availabilityId && this.selectedDoctorId) {
      try {
        const headers = this.getAuthHeaders();
        const resp = await this.http.get<any>(`${environment.apiUrl}/availability/practitioner/${this.selectedDoctorId}`, { headers }).toPromise();
        const avails = Array.isArray(resp) ? resp : (resp?.data || []);
        const normalizeTime = (t: string) => (t || '').trim();
        const match = avails.find((a: any) =>
          a.dayOfWeek === actualDayOfWeek &&
          normalizeTime(a.startTime) === normalizeTime(slot.startTime) &&
          normalizeTime(a.endTime) === normalizeTime(slot.endTime) &&
          Number(a.slotDuration) === Number(slot.slotDuration)
        );
        if (match) {
          slot.availabilityId = match.id;
          this.editingSlot.availabilityId = match.id;
          this.weeklySchedule = [...this.weeklySchedule];
        }
      } catch (e) {
        // ignore lookup failure
      }
    }

    // Populate the form values for editing
    this.timeSlotForm.patchValue({
      dayOfWeek: actualDayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      slotDuration: slot.slotDuration
    });
  }

  async deleteTimeSlot(dayIndex: number, slotIndex: number): Promise<void> {
    if (!confirm('Are you sure you want to delete this time slot?')) return;

    try {
      const headers = this.getAuthHeaders();
      const day = this.weeklySchedule[dayIndex];
      const slot = day.availableTimes[slotIndex];
      
      let availabilityIdToDelete: number | null = null;

      // If we already have the availabilityId, use it directly
      if (slot.availabilityId) {
        availabilityIdToDelete = slot.availabilityId;
      } else {
        // Cannot delete slot without valid availability ID
        console.error('Cannot delete slot without availability ID');
        this.snackBar.open('Cannot delete slot - missing availability ID', 'Close', { duration: 3000 });
        return;
      }

      if (this.selectedDoctorId) {
        // Try to find the matching availability by querying the server
        try {
          const availResponse = await this.http.get<any>(`${environment.apiUrl}/availability/practitioner/${this.selectedDoctorId}`, {
            headers
          })
          .pipe(
            timeout(10000), // 10 second timeout
            catchError(this.handleError.bind(this))
          )
          .toPromise();

          const availabilities = availResponse?.data || availResponse || [];
          
          // Find the matching availability by dayOfWeek, startTime, endTime
          const date = new Date(this.weekStart);
          date.setDate(date.getDate() + dayIndex);
          const targetDayOfWeek = date.getDay();

          // Normalize times for comparison
          const normalizeTime = (t: string) => (t || '').trim();

          const matchingAvailability = availabilities.find((a: any) => 
            a.dayOfWeek === targetDayOfWeek && 
            normalizeTime(a.startTime) === normalizeTime(slot.startTime) && 
            normalizeTime(a.endTime) === normalizeTime(slot.endTime) &&
            Number(a.slotDuration) === Number(slot.slotDuration)
          );

          if (matchingAvailability) {
            availabilityIdToDelete = matchingAvailability.id;
            console.log('Found matching availability on server:', availabilityIdToDelete);
          }
        } catch (findError) {
          console.error('Error finding availability to delete:', findError);
        }
      }

      if (availabilityIdToDelete) {
        // Delete the availability record
        console.log('Deleting availability with ID:', availabilityIdToDelete);
        await this.http.delete(`${environment.apiUrl}/availability/${availabilityIdToDelete}`, { headers }).toPromise();
        this.snackBar.open('Time slot deleted successfully', 'Close', { duration: 3000 });
      } else {
        console.log('Could not find server-side availability to delete, removing from UI only');
        this.snackBar.open('Time slot removed from schedule', 'Close', { duration: 3000 });
      }

      // Remove from local schedule immediately
      day.availableTimes.splice(slotIndex, 1);
      
      // Recalculate slots
      const removedSlots = this.calculateSlots(slot.startTime, slot.endTime, slot.slotDuration);
      day.totalSlots = Math.max(0, day.totalSlots - removedSlots);
      
      // Check if day should still be working day
      if (day.availableTimes.length === 0) {
        day.isWorkingDay = false;
      }
      
      // Update stats
      this.calculateWeekStats();
      
      // Force change detection
      this.weeklySchedule = [...this.weeklySchedule];
      
      // Notify practitioner about the update
      if (this.selectedDoctorId) {
        try { 
          this.notifyPractitionerUpdate(this.selectedDoctorId); 
        } catch (e) { 
          console.warn('Failed to notify practitioner about time slot deletion', e); 
        }
      }
      
    } catch (error: any) {
      console.error('Error deleting time slot:', error);
      const errorMessage = error?.error?.message || error?.message || 'Failed to delete time slot';
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
    }
  }

  async deleteAppointment(appointmentId: number): Promise<void> {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      const headers = this.getAuthHeaders();
      await this.http.delete(`${environment.apiUrl}/appointments/${appointmentId}`, { headers }).toPromise();
      
      this.snackBar.open('Appointment cancelled successfully', 'Close', { duration: 3000 });
      await this.loadWeeklySchedule();
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      this.snackBar.open('Failed to cancel appointment', 'Close', { duration: 3000 });
    }
  }

  formatDateForDay(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  async generateTimeSlotsForPractitioner(): Promise<void> {
    if (!this.selectedDoctorId) return;

    try {
      const headers = this.getAuthHeaders();
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 30);

      const startDateStr = today.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      console.log('Generating time slots for practitioner:', this.selectedDoctorId, 'from', startDateStr, 'to', endDateStr);

      // Be robust: try the modern body-based endpoint first, then fallback to the url-based variant
      let generated = false;
      try {
        await this.http.post(`${environment.apiUrl}/availability/generate-slots`, {
          startDate: startDateStr,
          endDate: endDateStr,
          practitionerId: this.selectedDoctorId
        }, { headers }).toPromise();
        generated = true;
        console.log('generate-slots body-based endpoint succeeded');
      } catch (err) {
        console.warn('Body-based generate-slots failed, trying practitioner-specific URL form', err);
        try {
          await this.http.post(`${environment.apiUrl}/availability/generate-slots/${this.selectedDoctorId}`, null, {
            headers,
            params: { startDate: startDateStr, endDate: endDateStr }
          }).toPromise();
          generated = true;
          console.log('generate-slots practitioner-specific endpoint succeeded');
        } catch (err2) {
          console.error('Both generate-slots attempts failed', err2);
          throw err2;
        }
      }

      this.snackBar.open('Time slots generated successfully', 'Close', { duration: 3000 });
      
      // Reload the schedule to show the new slots. Poll a few times because backend may take a moment
      const maxAttempts = 6;
      const delayMs = 1200;
      let attempt = 0;

      const poll = async () => {
        attempt++;
        await this.loadWeeklySchedule();
        // If timeSlots were loaded and show up in weeklySchedule, stop polling
        const totalSlots = this.weeklySchedule.reduce((s, d) => s + (d.totalSlots || 0), 0);
        if (totalSlots > 0 || attempt >= maxAttempts) {
          try {
            await this.viewPractitionerSlots(this.selectedDoctorId!);
          } catch (e) {
            // ignore
          }
          return;
        }
        setTimeout(poll, delayMs);
      };

      setTimeout(poll, 800);
      
    } catch (error: any) {
      console.error('Error generating time slots:', error);
      const errorMessage = error?.error?.message || error?.message || 'Failed to generate time slots';
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
    }
  }

  cancelSlotEdit(): void {
    this.editingSlot = null;
    this.timeSlotForm.reset();
  }

  async saveSchedule(): Promise<void> {
    if (!this.selectedDoctorId) {
      this.snackBar.open('Please select a doctor first', 'Close', { duration: 3000 });
      return;
    }

    let hasChangesToSave = false;
    const savePromises: any[] = [];
    const deactivatePromises: any[] = [];
    const deactivateDays: number[] = [];

  // collect metadata for created slots so we can attach returned ids back to slots
  const promiseMeta: any[] = [];
    
    this.weeklySchedule.forEach((day, dayIndex) => {
      // Calculate the actual dayOfWeek for backend
      const date = new Date(this.weekStart);
      date.setDate(date.getDate() + dayIndex);
      const actualDayOfWeek = date.getDay();

      if (day.isWorkingDay && day.availableTimes.length > 0) {
        // Handle working days with time slots
        // Collect slots that need creation, we'll do a batch create later
  day.availableTimes.forEach((slot: any, slotIndex: number) => {
          if (slot.availabilityId) return; // already exists
          hasChangesToSave = true;
          const saveData = {
            practitionerId: this.selectedDoctorId!,
            dayOfWeek: actualDayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotDuration: slot.slotDuration,
            isActive: true
          };
          // store metadata for mapping returned IDs
          promiseMeta.push({ promise: null as any, dayIndex, slotIndex, saveData });
        });
      } else if (!day.isWorkingDay) {
        // Handle non-working days - collect them for batch deactivation
        deactivateDays.push(actualDayOfWeek);
        hasChangesToSave = true;
      }
    });
    
    if (!hasChangesToSave) {
      this.snackBar.open('No changes to save', 'Close', { duration: 3000 });
      return;
    }

    // Sequential flow: first create new availabilities in bulk, then deactivate days
    let createdArray: any[] = [];

    if (promiseMeta.length > 0) {
      const batchCreatePayload = promiseMeta
        .filter(m => m.saveData)
        .map(m => m.saveData);

      if (batchCreatePayload.length > 0) {
        try {
          console.log('Batch creating availabilities:', batchCreatePayload.length);
          const resp: any = await this.http.post(`${environment.apiUrl}/availability/batch-create`, {
            availabilities: batchCreatePayload
          }, { headers: this.getAuthHeaders() })
            .toPromise();

          createdArray = Array.isArray(resp) ? resp : (resp?.data || []);
          console.log('Batch create response items:', createdArray.length);
        } catch (error) {
          console.error('Error in batch create:', error);
          // continue - we will try to match later via fetch
          createdArray = [];
        }
      }
    }

    // Now perform batch deactivation if needed
    let deactivateResult: any = null;
    if (deactivateDays.length > 0) {
      try {
        console.log('Batch deactivating days:', deactivateDays);
        const resp = await this.http.post(`${environment.apiUrl}/availability/batch-deactivate`, {
          practitionerId: this.selectedDoctorId!,
          daysOfWeek: deactivateDays
        }, { headers: this.getAuthHeaders() }).toPromise();

  const anyResp: any = resp;
  deactivateResult = Array.isArray(anyResp) ? anyResp : (anyResp?.data || anyResp);
        console.log('Batch deactivate response:', deactivateResult);
      } catch (error) {
        console.error('Error in batch deactivate:', error);
        deactivateResult = null;
      }
    }

    // attach returned ids to local slots (use createdArray if available)
    let missingCount = 0;
    if (createdArray && createdArray.length > 0) {
      promiseMeta.forEach((metaEntry: any) => {
        const slot = this.weeklySchedule[metaEntry.dayIndex]?.availableTimes?.[metaEntry.slotIndex];
        if (!slot || slot.availabilityId) return;

        const date = new Date(this.weekStart);
        date.setDate(date.getDate() + metaEntry.dayIndex);
        const actualDayOfWeekForMeta = date.getDay();

        const match = createdArray.find((a: any) =>
          Number(a.dayOfWeek) === Number(actualDayOfWeekForMeta) &&
          (String(a.startTime || '').trim() === String(slot.startTime || '').trim()) &&
          (String(a.endTime || '').trim() === String(slot.endTime || '').trim()) &&
          Number(a.slotDuration) === Number(slot.slotDuration)
        );

        if (match) slot.availabilityId = match.id;
      });
    }

    // Fallback: count missing ids and try fetching availabilities to match
    for (let i = 0; i < promiseMeta.length; i++) {
      const meta = promiseMeta[i];
      const slot = this.weeklySchedule[meta.dayIndex].availableTimes[meta.slotIndex];
      if (!slot) continue;
      if (!slot.availabilityId) missingCount++;
    }

    if (missingCount > 0 && this.selectedDoctorId) {
      try {
        const resp = await this.http.get<any>(`${environment.apiUrl}/availability/practitioner/${this.selectedDoctorId}`, { headers: this.getAuthHeaders() }).toPromise();
        const avails = Array.isArray(resp) ? resp : (resp?.data || []);
        console.log('Fetched practitioner availabilities for matching (fallback):', avails.length);

        for (let i = 0; i < promiseMeta.length; i++) {
          const meta = promiseMeta[i];
          const slot = this.weeklySchedule[meta.dayIndex].availableTimes[meta.slotIndex];
          if (!slot || slot.availabilityId) continue;

          const date = new Date(this.weekStart);
          date.setDate(date.getDate() + meta.dayIndex);
          const actualDayOfWeek = date.getDay();

          const match = avails.find((a: any) =>
            Number(a.dayOfWeek) === Number(actualDayOfWeek) &&
            (a.startTime || '').trim() === (slot.startTime || '').trim() &&
            (a.endTime || '').trim() === (slot.endTime || '').trim() &&
            Number(a.slotDuration) === Number(slot.slotDuration)
          );

          if (match) {
            slot.availabilityId = match.id;
          }
        }
        this.weeklySchedule = [...this.weeklySchedule];
      } catch (e) {
        console.warn('Error fetching practitioner availabilities to match missing ids (fallback):', e);
      }
    }

    // Build success message
    let successMessage = 'Schedule updated successfully';
    if ((promiseMeta.length > 0) && (deactivateDays.length > 0)) {
      successMessage = `Schedule updated: ${promiseMeta.length} time slots added, availability deactivated for non-working days`;
    } else if (promiseMeta.length > 0) {
      successMessage = `Schedule saved: ${promiseMeta.length} time slots added`;
    } else if (deactivateDays.length > 0) {
      successMessage = 'Schedule updated: availability deactivated for non-working days';
    }

    this.snackBar.open(successMessage, 'Close', { duration: 4000 });

    // Notify practitioner
    if (this.selectedDoctorId) this.notifyPractitionerUpdate(this.selectedDoctorId);

    // regenerate time slots so practitioner receives updates
    try {
      await this.generateTimeSlotsForPractitioner();
    } catch (e) {
      console.warn('generateTimeSlotsForPractitioner failed:', e);
    }

    // Reload to ensure data is fresh
    setTimeout(() => {
      this.loadWeeklySchedule();
    }, 1000);
  }
}

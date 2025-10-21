import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, retry, delay, switchMap, map } from 'rxjs/operators';

export interface TimeSlot {
  id: number;
  practitionerId: number;
  date: string;
  startTime: string;
  endTime: string;
  status: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
  consultation?: any;
}

export interface PractitionerAvailability {
  id: number;
  practitionerId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive: boolean;
  practitioner?: any;
}

export interface CreateAvailabilityRequest {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive?: boolean;
}

export interface UpdateAvailabilityRequest {
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AvailabilityService {
  private apiUrl = 'http://localhost:3000/api/v1';

  constructor(private http: HttpClient) {
    console.log('AvailabilityService initialized with API URL:', this.apiUrl);
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('authToken');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }

  getCurrentPractitionerId(): number {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    console.log('Current user from localStorage:', user);
    const id = user.id;
    console.log('Extracted practitioner ID:', id);
    if (!id || isNaN(id)) {
      console.error('Invalid practitioner ID:', id);
      throw new Error('Invalid practitioner ID. Please log in again.');
    }
    return Number(id);
  }

  getMyAvailability(): Observable<any> {
    const practitionerId = this.getCurrentPractitionerId();
    return this.http.get<any>(`${this.apiUrl}/availability/practitioner/${practitionerId}`, {
      headers: this.getAuthHeaders()
    });
  }

  createAvailability(data: CreateAvailabilityRequest): Observable<any> {
    console.log('Creating availability with data:', data);

    return this.http.post<any>(`${this.apiUrl}/availability`, data, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(error => {
        console.warn('Primary create endpoint failed:', error.status, error.message || error);
        
        if (error && error.status === 400) {
          console.log('Falling back to direct endpoint');
          return this.http.post<any>(`${this.apiUrl}/availability/direct`, data, {
            headers: this.getAuthHeaders()
          }).pipe(
            catchError(directErr => {
              console.error('Direct endpoint also failed:', directErr);
              return of({
                status: directErr.status || 400,
                message: directErr.error?.message || 'Failed to create availability. Please try again.',
                error: true
              });
            })
          );
        }

        return of({
          status: error.status || 400,
          message: error.error?.message || 'Failed to create availability. Please try again.',
          error: true
        });
      })
    );
  }

  updateAvailability(id: number, data: UpdateAvailabilityRequest): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/availability/${id}`, data, {
      headers: this.getAuthHeaders()
    });
  }

  deleteAvailability(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/availability/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  getMyTimeSlots(startDate?: string, endDate?: string, cacheBuster?: string): Observable<any> {
    let params: any = {};
    if (startDate && endDate) {
      params = { startDate, endDate };
    }
    
    console.log('API URL:', this.apiUrl);
    
    // Get the practitioner's ID
    const practitionerId = this.getCurrentPractitionerId();
    
    // Add timestamp to prevent caching
    params._t = cacheBuster ? Date.now() : params._t || Date.now();
    
    // Generate the URL with effective cache busting
    const url = `${this.apiUrl}/availability/slots/${practitionerId}`;
    console.log('Full URL will be:', url, 'with cache buster:', params._t);
    console.log('Requesting slots for practitioner ID:', practitionerId, 'from', startDate, 'to', endDate);
    
    // Use a single direct approach with smart retry logic
    // This helps avoid making too many parallel requests causing 429 errors
    
    // Handle 429 with longer backoff
    const handleRateLimiting = (error: any) => {
      if (error.status === 429) {
        console.log('Rate limited (429), waiting longer before retry');
        // Wait at least 3 seconds plus some random jitter for 429 errors to avoid admin conflicts
        return of(null).pipe(delay(3000 + Math.random() * 2000));
      }
      
      // Default exponential backoff for other errors
      return of(null).pipe(delay(1000 * (Math.random() + 0.5)));
    };
    
    // Direct approach - get slots by date range for specific practitioner
    return this.http.get<any>(url, { 
      params,
      headers: this.getAuthHeaders()
    }).pipe(
      retry({
        count: 2,  // Reduce retries to avoid conflicts with admin requests
        delay: handleRateLimiting, // Smart backoff for rate limiting
        resetOnSuccess: true
      }),
      map(response => {
        console.log('Raw API response received:', response);
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
          console.warn('Unexpected response format:', response);
          slotsArray = [];
        }
        
        console.log('Normalized slots array:', slotsArray.length, 'slots');
        if (slotsArray.length > 0) {
          console.log('First slot:', slotsArray[0]);
          console.log('Date range of slots:', 
            'from', slotsArray[0]?.date, 
            'to', slotsArray[slotsArray.length - 1]?.date);
        }
        
        return { data: slotsArray };
      }),
      catchError(error => {
        console.log('Error getting slots, attempting fallback...', error);
        
        // If all retries fail, try one more time with my-slots endpoint
        // with much longer delay to allow rate limits to reset
        return of(null).pipe(
          delay(3000), // Wait 3 seconds before trying the fallback
          switchMap(() => {
            return this.http.get<any>(`${this.apiUrl}/availability/my-slots`, {
              params,
              headers: this.getAuthHeaders()
            }).pipe(
              catchError(mySlotError => {
                console.log('Both endpoints failed', mySlotError);
                
                // Last resort - try to build slots from availabilities
                return this.getMyAvailability().pipe(
                  map(response => {
                    console.log('Building slots from availabilities as last resort');
                    const availabilities = response?.data || response || [];
                    
                    if (availabilities.length === 0) {
                      return { data: [] };
                    }
                    
                    // Build slots from availabilities
                    const slots = this.buildSlotsFromAvailabilities(
                      availabilities, 
                      startDate || new Date().toISOString().split('T')[0],
                      endDate || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
                    );
                    
                    return { data: slots };
                  }),
                  catchError(() => of({ data: [] }))
                );
              })
            );
          })
        );
      })
    );
  }

  generateTimeSlots(startDate: string, endDate: string): Observable<any> {
    console.log('Generating time slots from', startDate, 'to', endDate);
    
    // Validate dates before sending to backend
    if (!startDate || !endDate) {
      console.error('Invalid dates provided:', { startDate, endDate });
      return throwError(() => new Error('Start date and end date are required'));
    }
    
    // Send request to backend
    return this.http.post<any>(`${this.apiUrl}/availability/generate-slots`, {
      startDate,
      endDate
    }, {
      headers: this.getAuthHeaders()
    }).pipe(
      retry(1), // Only retry once to avoid overwhelming the server
      catchError(error => {
        console.error('Error generating time slots:', error);
        
        // Return a proper error that can be handled by the component
        if (error.error && error.error.message) {
          return throwError(() => new Error(error.error.message));
        }
        
        return throwError(() => new Error('Failed to generate time slots. Please try again.'));
      })
    );
  }

  updateSlotStatus(slotId: number, status: 'AVAILABLE' | 'BLOCKED'): Observable<TimeSlot> {
    return this.http.patch<TimeSlot>(`${this.apiUrl}/availability/slots/${slotId}`, { status }, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(error => {
        console.log('Error using regular endpoint, trying alternative endpoint', error);
        // Try alternative URL format
        return this.http.patch<TimeSlot>(
          `${this.apiUrl}/availability/slots/${slotId}/status`, 
          { status },
          { headers: this.getAuthHeaders() }
        );
      })
    );
  }

  /**
   * Utility method to build slots from availability records when API is rate limited
   */
  buildSlotsFromAvailabilities(availabilities: PractitionerAvailability[], startDate: string, endDate: string): TimeSlot[] {
    if (!availabilities || availabilities.length === 0) {
      return [];
    }
    
    console.log('Building slots manually from availabilities');
    
    // Convert date strings to Date objects and normalize time to midnight
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    
    const slots: TimeSlot[] = [];
    let currentDate = new Date(start);
    let slotId = -1000; // Use negative IDs for generated slots
    
    // For each day in the date range
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      console.log(`Checking ${dateStr} (day of week: ${dayOfWeek})`);
      
      // Find all availabilities for this day of week
      const dayAvailabilities = availabilities.filter(a => a.dayOfWeek === dayOfWeek && a.isActive);
      
      if (dayAvailabilities.length > 0) {
        console.log(`Found ${dayAvailabilities.length} availabilities for ${dateStr} (day ${dayOfWeek})`);
      }
      
      // For each availability window on this day
      dayAvailabilities.forEach(avail => {
        // Generate slots based on availability window and slot duration
        const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Parse start and end times
        const [startHour, startMinute] = avail.startTime.split(':').map(Number);
        const [endHour, endMinute] = avail.endTime.split(':').map(Number);
        
        // Create actual time slots based on the duration
        const slotDurationMinutes = avail.slotDuration || 30;
        
        // Calculate start and end in minutes from midnight for easier calculation
        const startTimeMinutes = startHour * 60 + startMinute;
        const endTimeMinutes = endHour * 60 + endMinute;
        
        // Generate slots at each interval
        for (let timeMinutes = startTimeMinutes; timeMinutes < endTimeMinutes; timeMinutes += slotDurationMinutes) {
          // Calculate the slot end time (or the availability end time if that's earlier)
          const slotEndMinutes = Math.min(timeMinutes + slotDurationMinutes, endTimeMinutes);
          
          // Format the times as HH:MM
          const formatTime = (minutes: number) => {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          };
          
          const slotStartTime = formatTime(timeMinutes);
          const slotEndTime = formatTime(slotEndMinutes);
          
          // Create a slot for this specific time window
          const slot: TimeSlot = {
            id: slotId--, // Use unique negative IDs
            practitionerId: avail.practitionerId,
            date: dateStr,
            startTime: slotStartTime,
            endTime: slotEndTime,
            status: 'AVAILABLE'
          };
          
          slots.push(slot);
        }
      });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`Generated ${slots.length} slots from availabilities for date range ${startDate} to ${endDate}`);
    return slots;
  }

  deleteTimeSlot(slotId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/availability/slots/${slotId}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(error => {
        console.log('Error deleting slot, trying alternative endpoint', error);
        // Try alternative URL format
        return this.http.delete<void>(
          `${this.apiUrl}/availability/slots/${slotId}/delete`, 
          { headers: this.getAuthHeaders() }
        );
      })
    );
  }

  getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  }

  // Utility method to get standardized date range that matches admin behavior
  getStandardDateRange(): { startDate: string, endDate: string } {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log('Standard date range:', { startDateStr, endDateStr });
    console.log('Today:', startDate.toDateString());
    console.log('End date:', endDate.toDateString());
    
    return { startDate: startDateStr, endDate: endDateStr };
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';

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
  private apiUrl = API_ENDPOINTS.AVAILABILITY;

  constructor(private http: HttpClient) { }

  // Auth headers are provided by the global HTTP interceptor. Services should not read tokens directly.
  getMyAvailability(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/my-availability`);
  }

  createAvailability(data: CreateAvailabilityRequest): Observable<any> {
    return this.http.post<any>(this.apiUrl, data);
  }

  updateAvailability(id: number, data: UpdateAvailabilityRequest): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}`, data);
  }

  deleteAvailability(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getMyTimeSlots(startDate?: string, endDate?: string): Observable<any> {
    let params: any = {};
    if (startDate && endDate) {
      params = { startDate, endDate };
    }
    return this.http.get<any>(`${this.apiUrl}/my-slots`, { params });
  }

  generateTimeSlots(startDate: string, endDate: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/generate-slots`, { startDate, endDate });
  }

  updateSlotStatus(slotId: number, status: 'AVAILABLE' | 'BLOCKED'): Observable<TimeSlot> {
    return this.http.patch<TimeSlot>(`${this.apiUrl}/slots/${slotId}`, { status });
  }

  getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../interceptors/auth.interceptor';
import { environment } from '../../../environments/environment';
import { PaginatedResponse } from '../models/global';
import { IUser } from '../../modules/user/models/user';
import { IHealthMetricResponse } from '../../modules/user/models/patient';

export interface IPatientCreateRequest {
  email?: string;
  first_name: string;
  last_name: string;
  mobile_phone_number?: string;
  timezone?: string;
  communication_method?: string;
  preferred_language?: number | null;
  language_ids?: number[];
  temporary?: boolean;
  custom_fields?: { field: number; value: string | null }[];
}

export interface IPatientUpdateRequest {
  email?: string;
  first_name?: string;
  last_name?: string;
  mobile_phone_number?: string;
  timezone?: string;
  communication_method?: string;
  preferred_language?: number | null;
  temporary?: boolean;
  custom_fields?: { field: number; value: string | null }[];
}

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  getPatients(params?: {
    search?: string;
    page?: number;
    page_size?: number;
    temporary?: boolean;
  }): Observable<PaginatedResponse<IUser>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    return this.http.get<PaginatedResponse<IUser>>(`${this.apiUrl}/users/`, { params: httpParams });
  }

  getPatient(id: number): Observable<IUser> {
    return this.http.get<IUser>(`${this.apiUrl}/users/${id}/`);
  }

  createPatient(data: IPatientCreateRequest): Observable<IUser> {
    return this.http.post<IUser>(`${this.apiUrl}/users/`, data, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  updatePatient(id: number, data: IPatientUpdateRequest): Observable<IUser> {
    return this.http.patch<IUser>(`${this.apiUrl}/users/${id}/`, data, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  deletePatient(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${id}/`);
  }

  getPatientHealthMetrics(id: number, params?: {
    page?: number;
    page_size?: number;
  }): Observable<PaginatedResponse<IHealthMetricResponse>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }
    return this.http.get<PaginatedResponse<IHealthMetricResponse>>(
      `${this.apiUrl}/users/${id}/healthmetric/`,
      { params: httpParams }
    );
  }

}

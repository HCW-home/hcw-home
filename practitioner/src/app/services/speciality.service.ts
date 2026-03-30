import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Speciality } from '../models/user.model';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { BaseHttpService } from './base-http.service';

@Injectable({
  providedIn: 'root'
})
export class SpecialityService extends BaseHttpService {
  constructor(http: HttpClient) {
    super(http);
  }

  getAllSpecialities(): Observable<Speciality[]> {
    return this.get<Speciality[]>(API_ENDPOINTS.SPECIALITY);
  }

  getSpecialityById(id: number): Observable<Speciality> {
    return this.get<Speciality>(`${API_ENDPOINTS.SPECIALITY}/${id}`);
  }
}

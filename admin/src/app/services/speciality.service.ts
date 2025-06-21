import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Speciality } from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class SpecialityService {
  private apiUrl = `${environment.apiUrl}/v1/speciality`;

  constructor(private http: HttpClient) {}

  getAllSpecialities(): Observable<Speciality[]> {
    return this.http.get<ApiResponse<Speciality[]>>(this.apiUrl).pipe(
      map(response => response.data)
    );
  }
}

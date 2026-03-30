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

  constructor(private http: HttpClient) {}

  getAllSpecialities(): Observable<Speciality[]> {
    return this.http.get<ApiResponse<Speciality[]>>(`${environment.apiUrl}/speciality`).pipe(
      map(response => response.data)
    );
  }
  
  createSpeciality(speciality: { name: string }): Observable<Speciality> {
    return this.http.post<ApiResponse<Speciality>>(`${environment.apiUrl}/v1/speciality`, speciality).pipe(
      map(response => response.data)
    );
  }

  updateSpeciality(id: number, speciality: { name: string }): Observable<Speciality> {
    return this.http.patch<ApiResponse<Speciality>>(`${environment.apiUrl}/v1/speciality/${id}`, speciality).pipe(
      map(response => response.data)
    );
  }

  deleteSpeciality(id: number): Observable<any> {
    return this.http.delete<ApiResponse<any>>(`${environment.apiUrl}/v1/speciality/${id}`);
  }

}

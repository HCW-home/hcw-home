import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface Speciality {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class SpecialityService {

  constructor(private http: HttpClient) {}

  // Get all specialities
  getAllSpecialities(): Observable<Speciality[]> {
    const apiUrl = `${environment.apiUrl}/speciality`;
    return this.http.get<Speciality[]>(apiUrl);
  }
  
}
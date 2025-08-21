import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';


export interface JoinConsultationResponseDto{
  
}

@Injectable({ providedIn: 'root' })
export class JoinConsultationService {
  constructor(private http: HttpClient) {}

  joinConsultation(consultationId: number, userId: number) {
    const url = `${environment.apiUrl}/consultation/${consultationId}/join/patient`;
    const body = { userId };

    return this.http.post(url, body);
  }
}

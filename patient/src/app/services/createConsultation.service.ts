import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export interface CreateConsultationDto {
  patientId: number;
  ownerId?: number;
  scheduledDate?: Date;
  groupId?: number | null;
  specialityId?: number | null;
  symptoms?: string;
  draft?: boolean;
}

@Injectable({ providedIn: 'root' })
export class createConsultationService {
  constructor(private http: HttpClient) {}

  createConsultation(dto: CreateConsultationDto, userId: number) {
    const url = `${environment.apiUrl}/consultation`;
    const params = new HttpParams().set('userId', userId.toString());

    return this.http.post(url, dto, { params });
  }
}

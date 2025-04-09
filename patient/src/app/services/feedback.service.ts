import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Feedback {
  id: number;
  consultationId: number;
  rating: number;
  comments?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedbackDto {
  consultationId: number;
  rating: number;
  comments?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private apiUrl = `${environment.apiUrl}/feedback`;

  constructor(private http: HttpClient) {}

  getFeedbackByConsultationId(consultationId: number): Observable<Feedback> {
    return this.http.get<Feedback>(`${this.apiUrl}/consultation/${consultationId}`);
  }

  createFeedback(feedback: CreateFeedbackDto): Observable<Feedback> {
    return this.http.post<Feedback>(this.apiUrl, feedback);
  }

  updateFeedback(id: number, feedback: Partial<CreateFeedbackDto>): Observable<Feedback> {
    return this.http.patch<Feedback>(`${this.apiUrl}/${id}`, feedback);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse } from '../dtos';

export interface NotificationSettings {
  enabled: boolean;
  phone?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private baseUrl = `${environment.apiUrl}/v1/notifications`;


  constructor(private http: HttpClient) {}

  /**
   * Update notification settings for the current user
   * @param settings Notification settings object
   */
  updateNotificationSettings(settings: NotificationSettings): Observable<ApiResponse<NotificationSettings>> {
    return this.http.patch<ApiResponse<NotificationSettings>>(this.baseUrl, settings);
  }

  /**
   * Optionally get current notification settings
   */
  getNotificationSettings(): Observable<NotificationSettings> {
    return this.http.get<NotificationSettings>(this.baseUrl);
  }
}

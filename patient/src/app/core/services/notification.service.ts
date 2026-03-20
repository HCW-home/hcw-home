import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiService, PaginatedResponse } from './api.service';
import { INotification, INotificationResponse, NotificationFilters, NotificationStatus } from '../models/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();
  private initialLoadDone = false;

  constructor(private api: ApiService) {}

  loadInitialUnreadCount(): void {
    if (this.initialLoadDone) return;
    this.initialLoadDone = true;
    this.api.get<INotificationResponse>('/user/notifications/', { limit: 10 }).subscribe({
      next: (response) => {
        const unread = response.results.filter(n => n.status !== NotificationStatus.READ).length;
        this.unreadCountSubject.next(unread);
      }
    });
  }

  incrementUnreadCount(): void {
    this.unreadCountSubject.next(this.unreadCountSubject.value + 1);
  }

  resetOnLogout(): void {
    this.unreadCountSubject.next(0);
    this.initialLoadDone = false;
  }

  getNotifications(filters?: NotificationFilters): Observable<INotificationResponse> {
    return this.api.get<INotificationResponse>('/user/notifications/', filters).pipe(
      tap(response => {
        const unread = response.results.filter(n => n.status !== NotificationStatus.READ).length;
        this.unreadCountSubject.next(unread);
      })
    );
  }

  markAsRead(id: number): Observable<INotification> {
    return this.api.post<INotification>(`/user/notifications/${id}/read/`, {}).pipe(
      tap(() => {
        const current = this.unreadCountSubject.value;
        if (current > 0) {
          this.unreadCountSubject.next(current - 1);
        }
      })
    );
  }

  markAllAsRead(): Observable<{ detail: string; updated_count: number }> {
    return this.api.post<{ detail: string; updated_count: number }>('/user/notifications/read/', {}).pipe(
      tap(() => this.unreadCountSubject.next(0))
    );
  }

}

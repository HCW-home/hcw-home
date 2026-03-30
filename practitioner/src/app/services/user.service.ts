import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User, UpdateUserProfileDto } from '../models/user.model';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { BaseHttpService } from './base-http.service';

@Injectable({
  providedIn: 'root'
})
export class UserService extends BaseHttpService {
  private cachedUser: User | null = null;

  constructor(http: HttpClient) {
    super(http);
  }

  getCurrentUser(forceRefresh: boolean = false): Observable<User> {
    if (this.cachedUser && !forceRefresh) {
      return new Observable<User>((observer) => {
        observer.next(this.cachedUser!);
        observer.complete();
      });
    }
    return new Observable<User>((observer) => {
      this.get<User>(API_ENDPOINTS.AUTH_ME).subscribe({
        next: (user) => {
          this.cachedUser = user;
          observer.next(user);
          observer.complete();
        },
        error: (err) => {
          observer.error(err);
        }
      });
    });
  }

  getUserById(id: number): Observable<User> {
    return this.get<User>(`${API_ENDPOINTS.USER}/${id}`);
  }

  updateUserProfile(userId: number, updateData: UpdateUserProfileDto): Observable<User> {
    return this.patch<User>(`${API_ENDPOINTS.USER}/${userId}`, updateData);
  }

  clearUserCache(): void {
    this.cachedUser = null;
  }
}

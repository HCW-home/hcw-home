import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, of, shareReplay, finalize } from 'rxjs';
import {
  IUser,
  ILanguage,
  ISpeciality,
  IUserUpdateRequest,
} from '../../modules/user/models/user';
import { environment } from '../../../environments/environment';
import { PaginatedResponse } from '../models/global';
import { TranslationService } from './translation.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private apiUrl = environment.apiUrl;
  http = inject(HttpClient);
  private translationService = inject(TranslationService);

  private currentUserSubject = new BehaviorSubject<IUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private currentUserRequest$: Observable<IUser> | null = null;

  get currentUserValue(): IUser | null {
    return this.currentUserSubject.getValue();
  }

  clearCurrentUser(): void {
    this.currentUserSubject.next(null);
    this.currentUserRequest$ = null;
  }

  getCurrentUser(forceRefresh = false): Observable<IUser> {
    // If we already have a user and not forcing refresh, return it
    if (!forceRefresh && this.currentUserValue) {
      return of(this.currentUserValue);
    }

    // If a request is already in progress, return the same observable
    if (this.currentUserRequest$) {
      return this.currentUserRequest$;
    }

    // Otherwise, make a new request
    this.currentUserRequest$ = this.http
      .get<IUser>(`${this.apiUrl}/auth/user/`)
      .pipe(
        tap(user => {
          this.currentUserSubject.next(user);
          if (user.preferred_language) {
            this.translationService.setLanguage(String(user.preferred_language));
          }
        }),
        shareReplay(1),
        finalize(() => {
          this.currentUserRequest$ = null;
        })
      );

    return this.currentUserRequest$;
  }

  updateCurrentUser(data: IUserUpdateRequest): Observable<IUser> {
    return this.http
      .patch<IUser>(`${this.apiUrl}/auth/user/`, data)
      .pipe(
        tap(user => {
          this.currentUserSubject.next(user);
          if (user.preferred_language) {
            this.translationService.setLanguage(String(user.preferred_language));
          }
        })
      );
  }

  uploadProfilePicture(file: File): Observable<IUser> {
    const formData = new FormData();
    formData.append('picture', file);
    return this.http
      .patch<IUser>(`${this.apiUrl}/auth/user/`, formData)
      .pipe(
        tap(user => {
          this.currentUserSubject.next(user);
          if (user.preferred_language) {
            this.translationService.setLanguage(String(user.preferred_language));
          }
        })
      );
  }

  searchUsers(
    query: string,
    page?: number,
    pageSize?: number,
    temporary?: boolean,
    hasGroupPermissions?: boolean,
    isPractitioner?: boolean
  ): Observable<PaginatedResponse<IUser>> {
    const params: Record<string, string | number | boolean> = { search: query };
    if (page) params['page'] = page;
    if (pageSize) params['page_size'] = pageSize;
    if (temporary !== undefined) params['temporary'] = temporary;
    if (hasGroupPermissions !== undefined)
      params['has_group_permissions'] = hasGroupPermissions;
    if (isPractitioner !== undefined)
      params['is_practitioner'] = isPractitioner;

    return this.http.get<PaginatedResponse<IUser>>(`${this.apiUrl}/users/`, {
      params,
    });
  }

  getLanguages(): Observable<ILanguage[]> {
    return this.http.get<ILanguage[]>(`${this.apiUrl}/languages/`);
  }

  getTestRtcInfo(): Observable<{ url: string; token: string; room: string }> {
    return this.http.get<{ url: string; token: string; room: string }>(
      `${this.apiUrl}/user/testrtc/`
    );
  }
}

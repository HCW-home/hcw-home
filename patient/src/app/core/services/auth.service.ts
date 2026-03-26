import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, from, switchMap, tap, shareReplay, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, LoginRequest, LoginResponse, RegisterRequest, MagicLinkRequest, MagicLinkVerify, TokenAuthRequest, TokenAuthResponse } from '../models/user.model';
import { StorageService } from './storage.service';
import { TranslationService } from './translation.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  public authReady: Promise<void>;
  private translationService = inject(TranslationService);

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    this.authReady = this.checkAuthStatus();
  }

  private async checkAuthStatus(): Promise<void> {
    const token = await this.storage.get('access_token');
    if (token) {
      this.isAuthenticatedSubject.next(true);
      try {
        await firstValueFrom(this.getCurrentUser());
      } catch {
        this.isAuthenticatedSubject.next(false);
        await this.storage.remove('access_token');
        await this.storage.remove('refresh_token');
      }
    }
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login/`, credentials)
      .pipe(
        switchMap(async (response) => {
          if (response.access) {
            await this.storage.set('access_token', response.access);
            await this.storage.set('refresh_token', response.refresh);
            this.isAuthenticatedSubject.next(true);
            await firstValueFrom(this.getCurrentUser());
          }
          return response;
        })
      );
  }

  register(data: RegisterRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/registration/`, data);
  }

  private configCache$: Observable<any> | null = null;
  private configData: any = null;

  getConfig(): Observable<any> {
    if (!this.configCache$) {
      this.configCache$ = this.http.get(`${this.apiUrl}/config/`).pipe(
        tap(config => this.configData = config),
        catchError(() => of(null)),
        shareReplay(1)
      );
    }
    return this.configCache$;
  }

  getConfigSnapshot(): any {
    return this.configData;
  }

  invalidateConfigCache(): void {
    this.configCache$ = null;
    this.configData = null;
  }

  /**
   * Preload config before app renders.
   * Called via APP_INITIALIZER.
   */
  initConfig(): Promise<any> {
    return firstValueFrom(this.getConfig());
  }

  verifyEmail(token: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/verify-email/`, { params: { token } });
  }

  forgotPassword(data: { email: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/password/reset/`, data);
  }

  resetPasswordConfirm(data: {
    uid: string;
    token: string;
    new_password1: string;
    new_password2: string;
  }): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.apiUrl}/auth/password/reset/confirm/`, data);
  }

  sendVerificationCode(email: string): Observable<{ detail: string; auth_token: string }> {
    return this.http.post<{ detail: string; auth_token: string }>(
      `${this.apiUrl}/auth/send-verification-code/`, { email }
    );
  }

  loginWithToken(data: TokenAuthRequest): Observable<TokenAuthResponse> {
    return this.http.post<TokenAuthResponse>(`${this.apiUrl}/auth/token/`, data)
      .pipe(
        switchMap(async (response) => {
          if (response.access && response.refresh) {
            await this.storage.set('access_token', response.access);
            await this.storage.set('refresh_token', response.refresh);
            this.isAuthenticatedSubject.next(true);
            await firstValueFrom(this.getCurrentUser());
          }
          return response;
        })
      );
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/auth/user/`)
      .pipe(
        tap(user => {
          this.currentUserSubject.next(user);
          if (user.preferred_language) {
            this.translationService.setLanguage(user.preferred_language);
          }
          if (user.is_first_login) {
            const updates: Partial<User> = { is_first_login: false };
            if (!user.preferred_language) {
              updates.preferred_language = this.translationService.currentLanguage();
            }
            if (!user.timezone || user.timezone === 'UTC') {
              updates.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            }
            this.updateProfile(updates).subscribe();
          }
        })
      );
  }

  uploadProfilePicture(file: File): Observable<User> {
    const formData = new FormData();
    formData.append('picture', file);
    return this.http.patch<User>(`${this.apiUrl}/auth/user/`, formData)
      .pipe(
        tap(user => this.currentUserSubject.next(user))
      );
  }

  updateProfile(data: Partial<User>): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/auth/user/`, data)
      .pipe(
        tap(user => this.currentUserSubject.next(user))
      );
  }

  get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  get isAuthenticatedValue(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  async logout() {
    // Call backend to blacklist the refresh token
    const refreshToken = await this.storage.get('refresh_token');
    if (refreshToken) {
      try {
        await firstValueFrom(
          this.http.post(`${this.apiUrl}/auth/logout/`, { refresh: refreshToken })
        );
      } catch {
        // Ignore errors, we're logging out anyway
      }
    }

    await this.storage.clear();
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  async getToken(): Promise<string | null> {
    return await this.storage.get('access_token');
  }

  async getRefreshToken(): Promise<string | null> {
    return await this.storage.get('refresh_token');
  }

  refreshToken(): Observable<{ access: string }> {
    return from(this.storage.get('refresh_token')).pipe(
      switchMap(refresh => {
        if (!refresh) {
          throw new Error('No refresh token available');
        }
        return this.http.post<{ access: string }>(`${this.apiUrl}/auth/token/refresh/`, { refresh });
      }),
      switchMap(async (response) => {
        if (response.access) {
          await this.storage.set('access_token', response.access);
        }
        return response;
      })
    );
  }
}

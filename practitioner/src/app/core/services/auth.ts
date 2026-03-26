import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, shareReplay, catchError, of } from 'rxjs';
import { SuccessResponse } from '../models/succesResponse';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../interceptors/auth.interceptor';
import {
  IBodyLogin,
  IResponseLogin,
  IBodySetPassword,
  IBodyForgotPassword,
  ITokenAuthRequest,
  ITokenAuthResponse,
  IOpenIDConfig,
  IOpenIDLoginBody,
} from '../models/admin-auth';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  http: HttpClient = inject(HttpClient);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(
    this.isLoggedIn()
  );
  public isAuthenticated$: Observable<boolean> =
    this.isAuthenticatedSubject.asObservable();
  private configCache$: Observable<IOpenIDConfig> | null = null;

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  setToken(token: string): void {
    localStorage.setItem('token', token);
    this.isAuthenticatedSubject.next(true);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  setRefreshToken(token: string): void {
    localStorage.setItem('refreshToken', token);
  }

  removeToken(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    this.isAuthenticatedSubject.next(false);
  }

  async logout(): Promise<void> {
    const refresh = this.getRefreshToken();
    if (refresh) {
      try {
        await firstValueFrom(
          this.http.post(`${environment.apiUrl}/auth/logout/`, { refresh })
        );
      } catch {
        // Ignore errors, we're logging out anyway
      }
    }
    this.removeToken();
  }

  refreshAccessToken(): Observable<{ access: string; refresh?: string }> {
    const refresh = this.getRefreshToken();
    return this.http.post<{ access: string; refresh?: string }>(
      `${environment.apiUrl}/auth/token/refresh/`,
      { refresh }
    );
  }

  login(body: IBodyLogin): Observable<IResponseLogin> {
    return this.http.post<IResponseLogin>(
      `${environment.apiUrl}/auth/login/`,
      body,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
    );
  }

  forgotPassword(body: IBodyForgotPassword): Observable<SuccessResponse> {
    return this.http.post<SuccessResponse>(
      `${environment.apiUrl}/auth/password/reset/`,
      body
    );
  }

  setPassword(params: IBodySetPassword): Observable<SuccessResponse> {
    return this.http.post<SuccessResponse>(
      `${environment.apiUrl}/auth/password/reset/confirm/`,
      params
    );
  }

  loginWithToken(data: ITokenAuthRequest): Observable<ITokenAuthResponse> {
    return this.http.post<ITokenAuthResponse>(
      `${environment.apiUrl}/auth/token/`,
      data
    );
  }

  getOpenIDConfig(): Observable<IOpenIDConfig> {
    if (this.configCache$) {
      return this.configCache$;
    }

    this.configCache$ = this.http
      .get<IOpenIDConfig>(`${environment.apiUrl}/config/`)
      .pipe(catchError(() => of(null as unknown as IOpenIDConfig)), shareReplay(1));

    return this.configCache$;
  }

  invalidateConfigCache(): void {
    this.configCache$ = null;
  }

  loginWithOpenID(authorizationCode: string): Observable<IResponseLogin> {
    const body: IOpenIDLoginBody = {
      code: authorizationCode,
      callback_url: `${window.location.origin}/auth/callback`,
    };

    return this.http.post<IResponseLogin>(
      `${environment.apiUrl}/auth/openid/`,
      body
    );
  }

  async initiateOpenIDLogin(): Promise<void> {
    const config = await firstValueFrom(this.getOpenIDConfig());

    if (!config.enabled || !config.client_id || !config.authorization_url) {
      return;
    }

    const state = this.generateRandomState();
    sessionStorage.setItem('openid_state', state);

    const params = new URLSearchParams({
      client_id: config.client_id,
      redirect_uri: `${window.location.origin}/auth/callback`,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });

    window.location.href = `${config.authorization_url}?${params.toString()}`;
  }

  private generateRandomState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }
}

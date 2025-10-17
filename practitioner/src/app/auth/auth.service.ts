import { Injectable, computed, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { map, switchMap, catchError } from "rxjs/operators";

import { Router } from "@angular/router";
import { UpdateUserProfileDto, ApiResponse, User } from "../models/user.model";
import { Observable, throwError } from "rxjs";
import { API_BASE_URL } from "../constants/api-endpoints";

@Injectable({ providedIn: "root" })
export class AuthService {
  private baseurl = `${API_BASE_URL}/auth`;
  private _user = signal<User | null>(null);
  private _loginChecked = signal(false);
  user = this._user.asReadonly();
  readonly loginChecked = this._loginChecked.asReadonly();
  isLoggedIn = computed(() => !!this._user());


  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    const userJson = localStorage.getItem('currentUser');
    if (userJson) {
      const userObj = JSON.parse(userJson);
      this._user.set(userObj);
    }
    this._loginChecked.set(true);
  }


  login(accessToken: string, refreshToken: string) {
    const headers = {
      Authorization: `Bearer ${accessToken}`
    };
    return this.http.get<any>(`${this.baseurl}/me`, { headers }).pipe(
      map(res => {
        if (res.data) {
          const fullUser: User = {
            ...res.data,
            accessToken: accessToken,
            refreshToken: refreshToken
          };
          this.storeCurrentUser(fullUser);
        }
        return res.data;
      })
    );
  }
  loginLocal(email: string, password: string) {
    return this.http
      .post<any>(`${this.baseurl}/login-local`, { email, password, role: 'PRACTITIONER' })
      .pipe(
        switchMap(res => {
          const accessToken = res.data?.accessToken;
          const refreshToken = res.data?.refreshToken;
          if (accessToken && refreshToken) {
            return this.login(accessToken, refreshToken);
          } else {
            console.warn('[AuthService] Invalid login response structure:', res);
            return throwError(() => new Error('Invalid login response'));
          }
        })
      );
  }

  storeCurrentUser(user: User) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    this._user.set(user);
    this._loginChecked.set(true);
  }

  logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('latestTerm')
    this._user.set(null);
    this.router.navigate(['/login']);
  }


  getToken(): string | undefined {
    const token = this._user()?.accessToken;
    return token;
  }

  getrefreshToken(): string | undefined {
    const token = this._user()?.refreshToken;
    return token;
  }
  getCurrentTerm() {
    const current = this._user()?.termVersion
    return current
  }

  updateTokens(accessToken?: string, refreshToken?: string): void {
    const currentUser = this._user();
    if (!currentUser) return;

    const updatedUser = {
      ...currentUser,
      accessToken: accessToken ?? currentUser.accessToken,
      refreshToken: refreshToken ?? currentUser.refreshToken
    };

    this.storeCurrentUser(updatedUser);
  }

  refreshToken() {
    const rToken = this.getrefreshToken();

    if (!rToken) {
      this.logout();
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http.post<any>(`${this.baseurl}/refresh-token`, { refreshToken: rToken }).pipe(
      map(res => {
        if (res.data?.accessToken) {
          const currentUser = this.getCurrentUser();

          if (!currentUser) {
            throw new Error('[AuthService] No current user found for refreshToken');
          }
          const updatedUser: User = {
            ...currentUser,
            accessToken: res.data.accessToken,
            refreshToken: res.data.refreshToken || rToken, // Use new refresh token if provided
          };

          this.storeCurrentUser(updatedUser);
          console.log('Token refreshed successfully');

          return updatedUser;
        } else {
          throw new Error('[AuthService] No access token found in refresh response');
        }
      }),
      // Enhanced error handling for token refresh failures
      catchError((error: any) => {
        console.error('Token refresh failed:', error);

        if (error.status === 401 || error.status === 403) {
          // Auth error - logout immediately
          this.logout();
        } else if (error.status === 0 || error.status >= 500) {
          // Network or server error - don't logout immediately, let interceptor handle retry
          console.warn('Network/server error during token refresh - will retry');
        } else {
          // Other errors - logout for safety
          this.logout();
        }

        return throwError(() => error);
      })
    );
  }

  getCurrentUser(): User | null {
    const user = this._user();
    return user;
  }



  updatePassword(password: string, username: string) {
    return this.http.post<any>(`${this.baseurl}/update-password`, { password: password, username: username }).pipe(
      map(res => { return res.data })
    )
  }
  updateProfile(updateData: UpdateUserProfileDto): Observable<User> {
    return this.http.post<ApiResponse<User>>(`${this.baseurl}/update`, updateData)
      .pipe(map((response: ApiResponse<User>) => response.data));
  }

}

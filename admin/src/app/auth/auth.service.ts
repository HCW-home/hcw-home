import { Injectable, computed, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { catchError, map, switchMap } from "rxjs/operators";
import { Router } from "@angular/router";
import { environment } from "../../environments/environment";
import { LoginUser } from "../models/user.model";
import {  throwError } from "rxjs";

@Injectable({ providedIn: "root" })
export class AuthService {
  private baseurl = `${environment.apiUrl}/v1/auth`;
  private _user = signal<LoginUser | null>(null);
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
      console.log('[AuthService] Loaded user from localStorage:', userObj);
      this._user.set(userObj);
    } else {
      console.log('[AuthService] No user found in localStorage.');
    }
    this._loginChecked.set(true);
  }


  login(accessToken: string, refreshToken:string) {
    console.log('[AuthService] Fetching profile from /me');

    const headers = {
      Authorization: `Bearer ${accessToken}`
    };

    return this.http.get<any>(`${this.baseurl}/me`, { headers }).pipe(
      map(res => {
        console.log('[AuthService] getprofile response:', res);
        if (res.data) {
          const fullUser: LoginUser = {
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
    console.log('[AuthService] Attempting loginLocal with:', { email });
    return this.http
      .post<any>(`${this.baseurl}/login-local`, { email, password, role: 'ADMIN' })
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

  storeCurrentUser(user: LoginUser) {
    console.log('[AuthService] Saving user to localStorage:', user);
    localStorage.setItem('currentUser', JSON.stringify(user));
    this._user.set(user);
    this._loginChecked.set(true);
  }

  logout() {
    console.log('[AuthService] Logging out user.');
    localStorage.removeItem('currentUser');
    this._user.set(null);
    this.router.navigate(['/login']);
  }


  getToken(): string | undefined {
    const token = this._user()?.accessToken;
    console.log('[AuthService] getToken:', token);
    return token;
  }

  getrefreshToken(): string | undefined {
    const token = this._user()?.refreshToken;
    console.log('[AuthService] getToken:', token);
    return token;
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
    console.log('[AuthService] Tokens updated:', updatedUser);
  }

  refreshToken() {
    console.log("refresh token called");

    const rToken = this.getrefreshToken();

    return this.http.post<any>(`${this.baseurl}/refresh-token`, { refreshToken: rToken }).pipe(
      map(res => {
        if (res.data?.accessToken) {
          const currentUser = this.getCurrentUser();

          if (!currentUser) {
            throw new Error('[AuthService] No current user found for refreshToken');
          }

          const updatedUser: LoginUser = {
            ...currentUser,
            accessToken: res.data.accessToken,
          };

          this.storeCurrentUser(updatedUser);

          return updatedUser;
        } else {
          throw new Error('[AuthService] No access token found in refresh response');
        }
      })
    );
  }

  getCurrentUser(): LoginUser | null {
    const user = this._user();
    console.log('[AuthService] getCurrentUser:', user);
    return user;
  }

}

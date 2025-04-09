import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';

export interface User {
  id: number;
  email: string;
  name?: string;
  role: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private tokenKey = 'auth_token';
  private userKey = 'current_user';

  constructor(
    private http: HttpClient,
    private router: Router,
    private storage: Storage
  ) {
    this.initStorage();
  }

  async initStorage() {
    await this.storage.create();
    this.loadStoredUser();
  }

  async loadStoredUser() {
    const token = await this.storage.get(this.tokenKey);
    const user = await this.storage.get(this.userKey);
    
    if (token && user) {
      this.currentUserSubject.next(user);
    }
  }

  login(email: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email })
      .pipe(
        tap(response => {
          this.storeAuthData(response);
        })
      );
  }

  verifyMagicLink(token: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/verify-magic-link`, { token })
      .pipe(
        tap(response => {
          this.storeAuthData(response);
        })
      );
  }

  register(email: string, name: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, { email, name })
      .pipe(
        tap(response => {
          this.storeAuthData(response);
        })
      );
  }

  async logout() {
    this.currentUserSubject.next(null);
    await this.storage.remove(this.tokenKey);
    await this.storage.remove(this.userKey);
    this.router.navigate(['/login']);
  }

  async getToken(): Promise<string | null> {
    return await this.storage.get(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  private async storeAuthData(response: AuthResponse) {
    await this.storage.set(this.tokenKey, response.token);
    await this.storage.set(this.userKey, response.user);
    this.currentUserSubject.next(response.user);
  }
}

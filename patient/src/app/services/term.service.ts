import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { ApiResponse } from '../models/user.model';
import { Term } from '../models/user.model';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class TermService {
  private baseUrl = `${environment.apiUrl}/term`;
  private _term = signal<Term | null>(null);
  private router = inject(Router)
  islatestTermAvailable = computed(() => !!this._term());

  constructor(
    private http: HttpClient,
    private authService: AuthService

  ) {
    const termJson = localStorage.getItem('latestTerm');
    if (termJson) {
      const termObj = JSON.parse(termJson);
      this._term.set(termObj);
    }
  }

  getLatestTermAndStore(): Observable<Term | undefined> {
    return this.http.get<ApiResponse<Term>>(`${this.baseUrl}/latest`).pipe(
      map(res => res.data),
      tap(latest => {
        
        this.setLatestTerm(latest);
      }),
      catchError(err => {
        console.error('Failed to fetch latest term:', err);
        return of(undefined);
      })
    );
  }
  setLatestTerm(term: Term) {
    localStorage.setItem('latestTerm', JSON.stringify(term));
    this._term.set(term)
  }
  getLatestTrem() {
    const term = this._term();
    return term;
  }

  deletelatestTerm() {
    localStorage.removeItem('latestTerm');
    this._term.set(null)
  }


  acceptTerm(termId: number): Observable<string> {
    return this.http.post<ApiResponse<string>>(`${this.baseUrl}/accept-term/${termId}`, '').pipe(
      map((res) => res.data)
    )
  }



}





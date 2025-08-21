import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Language, ApiResponse } from '../models/user.model';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const ENDPOINTS = {
  LANGUAGE: `${API_BASE_URL}/language`,
} as const;

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  constructor(private readonly http: HttpClient) {}

  getAllLanguages(): Observable<Language[]> {
    return this.http.get<ApiResponse<Language[]>>(ENDPOINTS.LANGUAGE)
      .pipe(map((response: ApiResponse<Language[]>) => response.data));
  }

  getLanguageById(id: number): Observable<Language> {
    return this.http.get<ApiResponse<Language>>(`${ENDPOINTS.LANGUAGE}/${id}`)
      .pipe(map((response: ApiResponse<Language>) => response.data));
  }
}

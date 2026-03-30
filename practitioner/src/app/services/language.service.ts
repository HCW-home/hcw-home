import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Language } from '../models/user.model';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { BaseHttpService } from './base-http.service';

@Injectable({
  providedIn: 'root'
})
export class LanguageService extends BaseHttpService {
  constructor(http: HttpClient) {
    super(http);
  }

  getAllLanguages(): Observable<Language[]> {
    return this.get<Language[]>(API_ENDPOINTS.LANGUAGE);
  }

  getLanguageById(id: number): Observable<Language> {
    return this.get<Language>(`${API_ENDPOINTS.LANGUAGE}/${id}`);
  }
}

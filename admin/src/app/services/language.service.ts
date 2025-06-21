import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Language } from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private apiUrl = `${environment.apiUrl}/v1/language`; // Adjust endpoint

  constructor(private http: HttpClient) {}

  getAllLanguages(): Observable<Language[]> {
    return this.http.get<ApiResponse<Language[]>>(this.apiUrl).pipe(
      map(response => response.data)
    );
  }
}

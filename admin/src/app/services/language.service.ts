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

  constructor(private http: HttpClient) {}

  getAllLanguages(): Observable<Language[]> {
    return this.http.get<ApiResponse<Language[]>>(`${environment.apiUrl}/language`).pipe(
      map(response => response.data)
    );
  }
  
  createLanguage(language: { name: string }): Observable<Language> {
  return this.http.post<ApiResponse<Language>>(`${environment.apiUrl}/v1/language`, language).pipe(
    map(response => response.data)
  );
}

updateLanguage(id: number, language: { name: string }): Observable<Language> {
  return this.http.patch<ApiResponse<Language>>(`${environment.apiUrl}/v1/language/${id}`, language).pipe(
    map(response => response.data)
  );
}

deleteLanguage(id: number): Observable<any> {
  return this.http.delete<ApiResponse<any>>(`${environment.apiUrl}/v1/language/${id}`);
}

}

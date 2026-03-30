import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment.development';
import { ApiResponse, PaginatedApiResponse, PaginationResult } from '../models/api-response.model';
import { map } from 'rxjs/operators';
import { CreatetermDto } from '../models/term.model';
 import { TermQuery,Term } from '../models/term.model';


@Injectable({
  providedIn: 'root',
})
export class TermsService {
  private baseUrl = `${environment.apiUrl}/term`;

  constructor(private http: HttpClient) {}
  getAll(query?: TermQuery): Observable<any> {
    let params = new HttpParams();

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params = params.set(key, value.toString());
        }
      });
    }

    return this.http.get(`${this.baseUrl}`, {
        params,
     });
  }

  getLatest(orgId: number, query: { language: string; country: string }): Observable<Term> {
    let params = new HttpParams()
      .set('language', query.language)
      .set('country', query.country)
      .set('organizationId',orgId);

    return this.http.get<Term>(`${this.baseUrl}/latest`, { params , 
    });
  }

  create( payload: CreatetermDto): Observable<Term> {
    return this.http.post<Term>(`${this.baseUrl}/`, payload,
    );
  }

  update(orgId: number, termId: number, payload: Partial<Term>): Observable<Term> {
     return this.http.patch<Term>(`${this.baseUrl}/${termId}`, payload);
  }

  delete(termId: number): Observable<Term> {
    return this.http.delete<Term>(`${this.baseUrl}/${termId}`);
  }


  getById(termId: number): Observable<Term> {
    return this.http.get<ApiResponse<Term>>(`${this.baseUrl}/${termId}`, {
    }).pipe(map(response => response.data));

 } 

}
  

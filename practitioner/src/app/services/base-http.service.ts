import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message: string;
  statusCode: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export abstract class BaseHttpService {
  constructor(protected http: HttpClient) { }

  /**
   * Extract data from API response
   */
  protected extractData<T>(response: ApiResponse<T>): T {
    return response.data;
  }

  /**
   * GET request with automatic data extraction
   */
  protected get<T>(url: string, params?: HttpParams): Observable<T> {
    return this.http.get<ApiResponse<T>>(url, { params })
      .pipe(map(response => this.extractData(response)));
  }

  /**
   * POST request with automatic data extraction
   */
  protected post<T>(url: string, body?: any): Observable<T> {
    return this.http.post<ApiResponse<T>>(url, body)
      .pipe(map(response => this.extractData(response)));
  }

  /**
   * PUT request with automatic data extraction
   */
  protected put<T>(url: string, body?: any): Observable<T> {
    return this.http.put<ApiResponse<T>>(url, body)
      .pipe(map(response => this.extractData(response)));
  }

  /**
   * PATCH request with automatic data extraction
   */
  protected patch<T>(url: string, body?: any): Observable<T> {
    return this.http.patch<ApiResponse<T>>(url, body)
      .pipe(map(response => this.extractData(response)));
  }

  /**
   * DELETE request with automatic data extraction
   */
  protected delete<T>(url: string): Observable<T> {
    return this.http.delete<ApiResponse<T>>(url)
      .pipe(map(response => this.extractData(response)));
  }

  /**
   * Raw HTTP request without data extraction (for non-standard responses)
   */
  protected getRaw<T>(url: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(url, { params });
  }

  protected postRaw<T>(url: string, body?: any): Observable<T> {
    return this.http.post<T>(url, body);
  }
}

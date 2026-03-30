import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment.development';


@Injectable({
  providedIn: 'root',
})
export class ExportService {

  constructor(private http: HttpClient) {}

  exportConsultations(filters: any) {
    let params = new HttpParams();
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.practitionerId) params = params.set('practitionerId', Number(filters.practitionerId));
    if (filters.status) params = params.set('status', filters.status);

    return this.http.get(`${environment.apiUrl}/export/consultations/csv`, { params, responseType: 'text' });
  }
}

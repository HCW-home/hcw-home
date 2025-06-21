import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Organization } from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class OrganizationService {
  private apiUrl = `${environment.apiUrl}/v1/organization`; // Adjust endpoint

  constructor(private http: HttpClient) {}

  getAllOrganizations(): Observable<Organization[]> {
    return this.http.get<ApiResponse<Organization[]>>(this.apiUrl).pipe(
      map(response => response.data)
    );
  }
}

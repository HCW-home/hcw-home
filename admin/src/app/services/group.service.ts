import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Group } from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  private baseUrl = `${environment.apiUrl}/v1/organization`;

  constructor(private http: HttpClient) {}

  getGroupsByOrganization(organizationId: number): Observable<Group[]> {
    const url = `${this.baseUrl}/${organizationId}/groups`;
    return this.http.get<ApiResponse<Group[]>>(url).pipe(
      map(response => response.data)
    );
  }
}

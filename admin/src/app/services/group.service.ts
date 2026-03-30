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

  constructor(private http: HttpClient) {}

  getGroupsByOrganization(organizationId: number): Observable<Group[]> {
    const url = `${environment.apiUrl}/organization/${organizationId}/groups`;
    return this.http.get<ApiResponse<Group[]>>(url).pipe(
      map(response => response.data)
    );
  }

  createGroup(organizationId: number, group: { name: string; description?: string; sharedOnlyIncomingConsultation?: boolean }): Observable<Group> {
    const url = `${environment.apiUrl}/v1/organization/${organizationId}/groups`;
    return this.http.post<ApiResponse<Group>>(url, group).pipe(
      map(response => response.data)
    );
  }

  updateGroup(organizationId: number, groupId: number, group: { name: string; description?: string; sharedOnlyIncomingConsultation?: boolean }): Observable<Group> {
    const url = `${environment.apiUrl}/v1/organization/${organizationId}/groups/${groupId}`;
    return this.http.patch<ApiResponse<Group>>(url, group).pipe(
      map(response => response.data)
    );
  }

  deleteGroup(organizationId: number, groupId: number): Observable<any> {
    const url = `${environment.apiUrl}/v1/organization/${organizationId}/groups/${groupId}`;
    return this.http.delete<ApiResponse<any>>(url);
  }

}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Group, ApiResponse } from '../models/user.model';

const API_BASE_URL = 'http://localhost:3000/api/v1';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  constructor(private readonly http: HttpClient) {}

  getGroupsByOrganization(organizationId: number, page: number = 1, limit: number = 100): Observable<Group[]> {
    const endpoint = `${API_BASE_URL}/organization/${organizationId}/groups`;
    const params = { page: page.toString(), limit: limit.toString() };
    
    return this.http.get<ApiResponse<PaginatedResponse<Group>>>(endpoint, { params })
      .pipe(map((response: ApiResponse<PaginatedResponse<Group>>) => response.data.data));
  }

  getGroupById(organizationId: number, groupId: number): Observable<Group> {
    const endpoint = `${API_BASE_URL}/organization/${organizationId}/groups/${groupId}`;
    
    return this.http.get<ApiResponse<Group>>(endpoint)
      .pipe(map((response: ApiResponse<Group>) => response.data));
  }
}
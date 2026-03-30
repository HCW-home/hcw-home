import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';

export interface Invite {
  id: number;
  patientName: string;
  patientEmail?: string;
  status: string;
  acceptanceStatus: string;
  statusTag: string; // For frontend display
  createdAt: string;
  consultationId?: number;
  scheduledDate?: string;
  practitionerId?: number;
  expiresAt?: string;
  notes?: string;
  communicationMethod?: string;
  token?: string; // For operations
}

export interface InvitesResponse {
  success: boolean;
  data: {
    invites: Invite[];
    total: number;
    currentPage: number;
    totalPages: number;
  };
}

export interface InviteActionResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvitesService {
  private apiUrl = API_ENDPOINTS.INVITES;

  constructor(private http: HttpClient) { }

  getInvites(page: number = 1, limit: number = 10): Observable<InvitesResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    const url = `${this.apiUrl}?${params.toString()}`;
    console.log('[InvitesService] Calling GET:', url);

    return this.http.get<InvitesResponse>(this.apiUrl, { params });
  }

  acceptInvite(inviteId: number): Observable<InviteActionResponse> {
    return this.http.post<InviteActionResponse>(`${this.apiUrl}/${inviteId}/accept`, {});
  }

  rejectInvite(inviteId: number): Observable<InviteActionResponse> {
    return this.http.post<InviteActionResponse>(`${this.apiUrl}/${inviteId}/reject`, {});
  }

  sendInvite(consultationId: number): Observable<InviteActionResponse> {
    return this.http.post<InviteActionResponse>(`${this.apiUrl}/send`, { consultationId });
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { User, CreateUserDto, UpdateUserDto, UserRole, UserStatus, UserSex } from '../models/user.model';
import { ApiResponse, PaginatedApiResponse, PaginationResult } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor(private http: HttpClient) {}

  getUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: UserRole,
    status?: UserStatus,
    sex?: UserSex,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Observable<PaginationResult<User>> {
    let params = new HttpParams();
    params = params.append('page', page.toString());
    params = params.append('limit', limit.toString());
    if (search) params = params.append('search', search);
    if (role) params = params.append('role', role);
    if (status) params = params.append('status', status);
    if (sex) params = params.append('sex', sex);
    if (sortBy) params = params.append('sortBy', sortBy);
    if (sortOrder) params = params.append('sortOrder', sortOrder);

    return this.http.get<ApiResponse<User[]>>(`${environment.apiUrl}/user`, {
      params
    }).pipe(
      map(response => ({
        users: response.data,
        total: response.data.length,
        page,
        limit
      }))
    );
  }

  getUserById(id: number): Observable<User> {
    return this.http.get<ApiResponse<User>>(`${environment.apiUrl}/user/${id}`, {
    }).pipe(map(response => response.data));
  }

  createUser(userDto: CreateUserDto): Observable<User> {
    return this.http.post<ApiResponse<User>>(`${environment.apiUrl}/user`, userDto, {
    }).pipe(map(response => response.data));
  }

  updateUser(id: number, userDto: UpdateUserDto): Observable<User> {
    return this.http.patch<ApiResponse<User>>(`${environment.apiUrl}/user/${id}`, userDto, {
    }).pipe(map(response => response.data));
  }

  deleteUser(id: number): Observable<User> {
    return this.http.delete<ApiResponse<User>>(`${environment.apiUrl}/user/${id}`, {
    }).pipe(map(response => response.data));
  }
}

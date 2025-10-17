import { environment } from '../../environments/environment';

export const API_BASE_URL = `${environment.apiUrl || 'http://localhost:3000/api'}/v1`;

export const API_ENDPOINTS = {
  AUTH_ME: `${API_BASE_URL}/auth/me`,

  USER: `${API_BASE_URL}/user`,

  LANGUAGE: `${API_BASE_URL}/language`,

  SPECIALITY: `${API_BASE_URL}/speciality`,

  TERM: `${API_BASE_URL}/term`,

  CONSULTATION: `${API_BASE_URL}/consultation`,

  AVAILABILITY: `${API_BASE_URL}/availability`,

  INVITES: `${API_BASE_URL}/invites`,

  NOTIFICATIONS: `${API_BASE_URL}/notifications`,
} as const;

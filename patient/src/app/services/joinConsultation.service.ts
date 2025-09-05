import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

// Enhanced DTOs for production-grade join consultation - matching backend structure
export interface JoinConsultationResponseDto {
  success: boolean;
  statusCode: number;
  message: string;
  consultationId?: number;
  sessionUrl?: string;
  redirectTo?: 'waiting-room' | 'consultation-room';
  userRole?: string;
  waitingRoom?: {
    practitionerId: number;
    practitionerName: string;
    estimatedWaitTime: string;
  };
  participants?: Array<{
    id: number;
    firstName: string;
    lastName: string;
    role: string;
    isActive: boolean;
  }>;
  messages?: Array<{
    id: number;
    userId: number;
    content: string;
    createdAt: string;
  }>;
  mediasoup?: {
    routerId: number;
    active: boolean;
  };
  status?: string;
  features?: {
    chat: boolean;
    voice: boolean;
    video: boolean;
    screenShare: boolean;
    fileShare: boolean;
  };
  mediaConfig?: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenShareEnabled: boolean;
  };
  timestamp?: string;
}

export interface SessionStatusResponse {
  consultationId: number;
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  currentStage: 'waiting_room' | 'consultation_room' | 'completed';
  redirectTo?: 'waiting-room' | 'consultation-room';
  waitingRoomUrl?: string;
  consultationRoomUrl?: string;
  estimatedWaitTime?: number;
  isActive: boolean;
  lastUpdated: string;
  practitionerPresent?: boolean;
  queuePosition?: number;
}

export interface JoinError {
  code: string;
  message: string;
  consultationId?: number;
  timestamp: string;
  recoverable: boolean;
  retryAfter?: number;
}

@Injectable({ providedIn: 'root' })
export class JoinConsultationService {
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  // State management
  private _isJoining = new BehaviorSubject<boolean>(false);
  private _currentConsultationId = new BehaviorSubject<number | null>(null);
  private _sessionStatus = new BehaviorSubject<SessionStatusResponse | null>(null);

  // Public observables
  public isJoining$ = this._isJoining.asObservable();
  public currentConsultationId$ = this._currentConsultationId.asObservable();
  public sessionStatus$ = this._sessionStatus.asObservable();

  constructor(private http: HttpClient) { }

  /**
   * Smart patient join with comprehensive error handling and retry logic
   */
  async smartPatientJoin(
    consultationId: number,
    patientId: number,
    options: {
      clientInfo?: any;
      requestTimeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<JoinConsultationResponseDto> {
    const { clientInfo, requestTimeout = this.REQUEST_TIMEOUT, maxRetries = this.MAX_RETRIES } = options;

    this._isJoining.next(true);
    this._currentConsultationId.next(consultationId);

    try {
      console.log(`[JoinConsultation] Attempting to join consultation ${consultationId} for patient ${patientId}`);

      const requestPayload = {
        userId: patientId,
        joinType: 'dashboard', // Default to dashboard join type
        clientInfo: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...clientInfo
        }
      };

      const response = await this.executeWithRetry(
        () => this.http.post<JoinConsultationResponseDto>(
          `${environment.apiUrl}/consultation/${consultationId}/join/patient/smart`,
          requestPayload,
          {
            headers: { 'Content-Type': 'application/json' }
          }
        ).pipe(
          timeout(requestTimeout)
        ).toPromise(),
        maxRetries,
        `join consultation ${consultationId}`
      );

      if (!response) {
        throw new Error('No response received from join consultation API');
      }

      console.log(`[JoinConsultation] Successfully joined consultation:`, response);

      // Update session status based on backend response
      if (response.consultationId) {
        this._sessionStatus.next({
          consultationId: response.consultationId,
          status: this.mapBackendStatusToFrontend(response.status),
          currentStage: this.mapRedirectToStage(response.redirectTo),
          waitingRoomUrl: response.sessionUrl && response.redirectTo === 'waiting-room' ? response.sessionUrl : undefined,
          consultationRoomUrl: response.sessionUrl && response.redirectTo === 'consultation-room' ? response.sessionUrl : undefined,
          estimatedWaitTime: response.waitingRoom?.estimatedWaitTime ? this.parseEstimatedTime(response.waitingRoom.estimatedWaitTime) : undefined,
          isActive: true,
          lastUpdated: new Date().toISOString(),
          practitionerPresent: response.participants?.some(p => p.role === 'PRACTITIONER' && p.isActive) || false,
          queuePosition: 1 // Default queue position
        });

        // Start session monitoring if consultation is active
        if (response.status === 'ACTIVE' || response.redirectTo === 'waiting-room') {
          this.startSessionMonitoring(response.consultationId);
        }
      }

      return response;

    } catch (error) {
      console.error(`[JoinConsultation] Failed to join consultation ${consultationId}:`, error);

      const joinError: JoinError = {
        code: this.getErrorCode(error),
        message: this.getErrorMessage(error),
        consultationId,
        timestamp: new Date().toISOString(),
        recoverable: this.isRecoverableError(error),
        retryAfter: this.getRetryAfter(error)
      };

      throw joinError;
    } finally {
      this._isJoining.next(false);
    }
  }

  /**
   * Join consultation using magic link token
   */
  async joinByToken(
    token: string,
    options: {
      userId?: number;
      clientInfo?: any;
      requestTimeout?: number;
    } = {}
  ): Promise<JoinConsultationResponseDto> {
    const { userId, clientInfo, requestTimeout = this.REQUEST_TIMEOUT } = options;

    this._isJoining.next(true);

    try {
      console.log(`[JoinConsultation] Joining via token: ${token.substring(0, 8)}...`);

      const requestPayload = {
        token,
        ...(userId && { userId }), // Include userId only if provided
        clientInfo: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...clientInfo
        }
      };

      const response = await this.http.post<JoinConsultationResponseDto>(
        `${environment.apiUrl}/consultation/join-by-token`,
        requestPayload,
        {
          headers: { 'Content-Type': 'application/json' }
        }
      ).pipe(
        timeout(requestTimeout)
      ).toPromise();

      if (!response) {
        throw new Error('No response received from token join API');
      }

      console.log(`[JoinConsultation] Successfully joined via token:`, response);

      if (response.consultationId) {
        this._currentConsultationId.next(response.consultationId);
        this._sessionStatus.next({
          consultationId: response.consultationId,
          status: this.mapBackendStatusToFrontend(response.status),
          currentStage: this.mapRedirectToStage(response.redirectTo),
          waitingRoomUrl: response.sessionUrl && response.redirectTo === 'waiting-room' ? response.sessionUrl : undefined,
          consultationRoomUrl: response.sessionUrl && response.redirectTo === 'consultation-room' ? response.sessionUrl : undefined,
          estimatedWaitTime: response.waitingRoom?.estimatedWaitTime ? this.parseEstimatedTime(response.waitingRoom.estimatedWaitTime) : undefined,
          isActive: true,
          lastUpdated: new Date().toISOString(),
          practitionerPresent: response.participants?.some(p => p.role === 'PRACTITIONER' && p.isActive) || false,
          queuePosition: 1 // Default queue position
        });

        // Start session monitoring
        if (response.status === 'ACTIVE' || response.redirectTo === 'waiting-room') {
          this.startSessionMonitoring(response.consultationId);
        }
      }

      return response;

    } catch (error) {
      console.error(`[JoinConsultation] Failed to join via token:`, error);

      const joinError: JoinError = {
        code: this.getErrorCode(error),
        message: this.getErrorMessage(error),
        timestamp: new Date().toISOString(),
        recoverable: this.isRecoverableError(error),
        retryAfter: this.getRetryAfter(error)
      };

      throw joinError;
    } finally {
      this._isJoining.next(false);
    }
  }

  /**
   * Check current session status
   */
  async checkSessionStatus(consultationId: number): Promise<SessionStatusResponse> {
    try {
      const response = await this.http.get<SessionStatusResponse>(
        `${environment.apiUrl}/consultation/${consultationId}/session-status`
      ).pipe(
        timeout(10000)
      ).toPromise();

      if (!response) {
        throw new Error('No response received from session status API');
      }

      this._sessionStatus.next({
        ...response,
        lastUpdated: new Date().toISOString()
      });

      return response;

    } catch (error) {
      console.error(`[JoinConsultation] Failed to check session status:`, error);
      throw error;
    }
  }

  /**
   * Start session monitoring with WebSocket or periodic polling
   */
  private startSessionMonitoring(consultationId: number): void {
    console.log(`[JoinConsultation] Starting session monitoring for consultation ${consultationId}`);

    // Check if WebSocket is available
    if (environment.wsUrl) {
      this.startWebSocketMonitoring(consultationId);
    } else {
      this.startPollingMonitoring(consultationId);
    }
  }

  /**
   * WebSocket-based session monitoring
   */
  private startWebSocketMonitoring(consultationId: number): void {
    try {
      const ws = new WebSocket(`${environment.wsUrl}/consultation/${consultationId}/status`);

      ws.onopen = () => {
        console.log(`[JoinConsultation] WebSocket connected for consultation ${consultationId}`);
      };

      ws.onmessage = (event) => {
        try {
          const statusUpdate = JSON.parse(event.data);
          console.log(`[JoinConsultation] WebSocket status update:`, statusUpdate);

          this._sessionStatus.next({
            ...statusUpdate,
            lastUpdated: new Date().toISOString()
          });

        } catch (error) {
          console.error('[JoinConsultation] Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[JoinConsultation] WebSocket error:', error);
        // Fallback to polling
        this.startPollingMonitoring(consultationId);
      };

      ws.onclose = () => {
        console.log('[JoinConsultation] WebSocket connection closed');
      };

    } catch (error) {
      console.error('[JoinConsultation] Failed to establish WebSocket connection:', error);
      // Fallback to polling
      this.startPollingMonitoring(consultationId);
    }
  }

  /**
   * Polling-based session monitoring
   */
  private startPollingMonitoring(consultationId: number): void {
    const pollInterval = setInterval(async () => {
      try {
        const status = await this.checkSessionStatus(consultationId);

        // Stop polling if consultation is completed or cancelled
        if (status.status === 'completed' || status.status === 'cancelled') {
          clearInterval(pollInterval);
        }

      } catch (error) {
        console.error('[JoinConsultation] Polling error:', error);
        // Continue polling even on errors
      }
    }, 5000); // Poll every 5 seconds
  }

  /**
   * Execute request with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    operationName: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt <= maxRetries && this.isRetryableError(error)) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          console.log(`[JoinConsultation] ${operationName} failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${delay}ms:`, error);

          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    // Network errors
    if (error.name === 'TimeoutError' || error.code === 'NETWORK_ERROR') {
      return true;
    }

    // HTTP status codes that are retryable
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    if (error.status && retryableStatusCodes.includes(error.status)) {
      return true;
    }

    return false;
  }

  /**
   * Determine if an error is recoverable
   */
  private isRecoverableError(error: any): boolean {
    if (!error) return false;

    // Authentication errors are not recoverable
    if (error.status === 401 || error.status === 403) {
      return false;
    }

    // Invalid consultation ID is not recoverable
    if (error.status === 404) {
      return false;
    }

    // Most other errors are potentially recoverable
    return true;
  }

  /**
   * Get standardized error code
   */
  private getErrorCode(error: any): string {
    if (!error) return 'UNKNOWN_ERROR';

    if (error.status) {
      switch (error.status) {
        case 400: return 'INVALID_REQUEST';
        case 401: return 'UNAUTHORIZED';
        case 403: return 'FORBIDDEN';
        case 404: return 'CONSULTATION_NOT_FOUND';
        case 409: return 'CONSULTATION_CONFLICT';
        case 429: return 'RATE_LIMITED';
        case 500: return 'SERVER_ERROR';
        case 502: return 'BAD_GATEWAY';
        case 503: return 'SERVICE_UNAVAILABLE';
        case 504: return 'GATEWAY_TIMEOUT';
        default: return `HTTP_${error.status}`;
      }
    }

    if (error.name === 'TimeoutError') return 'TIMEOUT';
    if (error.code === 'NETWORK_ERROR') return 'NETWORK_ERROR';

    return 'UNKNOWN_ERROR';
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(error: any): string {
    if (!error) return 'An unknown error occurred';

    // Use backend error message if available
    if (error.error?.message) {
      return error.error.message;
    }

    if (error.message) {
      return error.message;
    }

    // Default messages based on status code
    if (error.status) {
      switch (error.status) {
        case 400: return 'Invalid request. Please check your information and try again.';
        case 401: return 'Please log in to join this consultation.';
        case 403: return 'You do not have permission to join this consultation.';
        case 404: return 'Consultation not found. Please check the link or contact support.';
        case 409: return 'Unable to join consultation. It may already be in progress.';
        case 429: return 'Too many requests. Please wait a moment and try again.';
        case 500: return 'Server error. Please try again later.';
        case 502: return 'Service temporarily unavailable. Please try again.';
        case 503: return 'Service temporarily unavailable. Please try again.';
        case 504: return 'Request timeout. Please check your connection and try again.';
        default: return `An error occurred (${error.status}). Please try again.`;
      }
    }

    return 'An error occurred. Please check your connection and try again.';
  }

  /**
   * Get retry after time from error response
   */
  private getRetryAfter(error: any): number | undefined {
    if (error?.headers?.['retry-after']) {
      return parseInt(error.headers['retry-after'], 10) * 1000;
    }

    // Default retry times based on error type
    if (error.status === 429) return 60000; // 1 minute for rate limiting
    if (error.status >= 500) return 30000; // 30 seconds for server errors

    return undefined;
  }

  /**
   * Clear current session state
   */
  clearSession(): void {
    this._isJoining.next(false);
    this._currentConsultationId.next(null);
    this._sessionStatus.next(null);
  }

  /**
   * Get current session information
   */
  getCurrentSession(): SessionStatusResponse | null {
    return this._sessionStatus.value;
  }

  /**
   * Check if currently joining a consultation
   */
  isCurrentlyJoining(): boolean {
    return this._isJoining.value;
  }

  /**
   * Map backend status to frontend status
   */
  private mapBackendStatusToFrontend(status?: string): 'waiting' | 'active' | 'completed' | 'cancelled' {
    switch (status) {
      case 'WAITING':
      case 'SCHEDULED':
        return 'waiting';
      case 'ACTIVE':
        return 'active';
      case 'COMPLETED':
        return 'completed';
      case 'CANCELLED':
      case 'TERMINATED_OPEN':
        return 'cancelled';
      default:
        return 'waiting';
    }
  }

  /**
   * Map redirect destination to current stage
   */
  private mapRedirectToStage(redirectTo?: string): 'waiting_room' | 'consultation_room' | 'completed' {
    switch (redirectTo) {
      case 'waiting-room':
        return 'waiting_room';
      case 'consultation-room':
        return 'consultation_room';
      default:
        return 'waiting_room';
    }
  }

  /**
   * Parse estimated time string to minutes
   */
  private parseEstimatedTime(timeString: string): number {
    const match = timeString.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 5; // Default to 5 minutes
  }
}

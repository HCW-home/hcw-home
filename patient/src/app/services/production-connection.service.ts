import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, timer, EMPTY, throwError } from 'rxjs';
import { catchError, retry, timeout, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface ConnectionStatus {
 isConnected: boolean;
 lastCheckTime: Date;
 latency: number;
 errorMessage?: string;
 backendHealth?: {
  status: string;
  database: boolean;
  redis: boolean;
  mediasoup: boolean;
 };
}

export interface RetryConfig {
 maxAttempts: number;
 delay: number;
 backoff: 'linear' | 'exponential';
}

@Injectable({
 providedIn: 'root'
})
export class ProductionConnectionService {
 private connectionStatus = new BehaviorSubject<ConnectionStatus>({
  isConnected: false,
  lastCheckTime: new Date(),
  latency: 0
 });

 private healthCheckTimer?: any;
 private retryAttempts = 0;
 private maxRetryAttempts = environment.maxRetryAttempts || 3;

 constructor(private http: HttpClient) {
  this.initializeConnection();
 }

 get connectionStatus$(): Observable<ConnectionStatus> {
  return this.connectionStatus.asObservable();
 }

 get isConnected(): boolean {
  return this.connectionStatus.value.isConnected;
 }

 /**
  * Initialize connection monitoring with production-grade configuration
  */
 private initializeConnection(): void {
  this.performHealthCheck().subscribe();
  this.setupPeriodicHealthChecks();
  this.setupConnectionRecovery();
 }

 /**
  * Perform comprehensive health check with timeout and retry logic
  */
 performHealthCheck(): Observable<ConnectionStatus> {
  const startTime = performance.now();

  return this.http.get<any>(`${environment.healthCheckUrl}`, {
   headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
   }
  }).pipe(
   timeout(environment.connectionTimeout),
   retry({
    count: 2,
    delay: (error, retryCount) => {
     const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
     console.log(`Health check retry ${retryCount} after ${delay}ms`);
     return timer(delay);
    }
   }),
   tap(response => {
    const latency = performance.now() - startTime;
    const status: ConnectionStatus = {
     isConnected: true,
     lastCheckTime: new Date(),
     latency: Math.round(latency),
     backendHealth: {
      status: response?.status || 'unknown',
      database: response?.database?.connected || false,
      redis: response?.redis?.connected || false,
      mediasoup: response?.mediasoup?.status === 'healthy' || false
     }
    };

    this.connectionStatus.next(status);
    this.retryAttempts = 0; // Reset on successful connection

    if (environment.enableDebugLogging) {
     console.log('✅ Backend health check successful', {
      latency: `${latency.toFixed(0)}ms`,
      status: response?.status,
      services: status.backendHealth
     });
    }
   }),
   catchError(error => {
    const latency = performance.now() - startTime;
    const status: ConnectionStatus = {
     isConnected: false,
     lastCheckTime: new Date(),
     latency: Math.round(latency),
     errorMessage: this.getErrorMessage(error)
    };

    this.connectionStatus.next(status);
    this.handleConnectionError(error);

    return EMPTY;
   })
  );
 }

 /**
  * Setup periodic health checks with production intervals
  */
 private setupPeriodicHealthChecks(): void {
  const interval = environment.healthCheckInterval || 30000;

  this.healthCheckTimer = setInterval(() => {
   this.performHealthCheck().subscribe();
  }, interval);

  if (environment.enableDebugLogging) {
   console.log(`🔄 Health check monitoring started (interval: ${interval}ms)`);
  }
 }

 /**
  * Setup connection recovery mechanism
  */
 private setupConnectionRecovery(): void {
  this.connectionStatus$.subscribe(status => {
   if (!status.isConnected && this.retryAttempts < this.maxRetryAttempts) {
    this.attemptConnectionRecovery();
   }
  });
 }

 /**
  * Attempt to recover connection with exponential backoff
  */
 private attemptConnectionRecovery(): void {
  this.retryAttempts++;
  const delay = Math.min(environment.retryDelay * Math.pow(2, this.retryAttempts - 1), 30000);

  if (environment.enableDebugLogging) {
   console.log(`🔄 Attempting connection recovery (${this.retryAttempts}/${this.maxRetryAttempts}) in ${delay}ms`);
  }

  timer(delay).pipe(
   switchMap(() => this.performHealthCheck())
  ).subscribe();
 }

 /**
  * Enhanced HTTP request with production-grade error handling
  */
 makeRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: any,
  options?: {
   timeout?: number;
   retryConfig?: RetryConfig;
   headers?: { [key: string]: string };
  }
 ): Observable<T> {
  const url = `${environment.apiUrl}${endpoint}`;
  const requestOptions = {
   headers: {
    'Content-Type': 'application/json',
    'X-Client': 'patient-app',
    'X-Version': environment.appConfig.version,
    ...options?.headers
   }
  };

  let request: Observable<T>;

  switch (method) {
   case 'GET':
    request = this.http.get<T>(url, requestOptions);
    break;
   case 'POST':
    request = this.http.post<T>(url, body, requestOptions);
    break;
   case 'PUT':
    request = this.http.put<T>(url, body, requestOptions);
    break;
   case 'DELETE':
    request = this.http.delete<T>(url, requestOptions);
    break;
  }

  return request.pipe(
   timeout(options?.timeout || environment.connectionTimeout),
   retry({
    count: options?.retryConfig?.maxAttempts || 2,
    delay: (error, retryCount) => {
     const baseDelay = options?.retryConfig?.delay || 1000;
     const delay = options?.retryConfig?.backoff === 'exponential'
      ? baseDelay * Math.pow(2, retryCount)
      : baseDelay;

     console.warn(`Retrying request to ${endpoint} (${retryCount}/${options?.retryConfig?.maxAttempts || 2}) after ${delay}ms`);
     return timer(Math.min(delay, 10000));
    }
   }),
   catchError(error => {
    console.error(`Request failed: ${method} ${endpoint}`, error);
    return throwError(() => error);
   })
  );
 }

 /**
  * Get backend service status for specific services
  */
 getServiceStatus(): Observable<{
  api: boolean;
  database: boolean;
  redis: boolean;
  mediasoup: boolean;
  websockets: boolean;
 }> {
  return this.makeRequest<any>('GET', '/health/services').pipe(
   catchError(error => {
    console.warn('Service status check failed', error);
    return throwError(() => error);
   })
  );
 }

 /**
  * Test WebSocket connectivity
  */
 testWebSocketConnection(): Promise<boolean> {
  return new Promise((resolve, reject) => {
   const timeout = setTimeout(() => {
    resolve(false);
   }, 5000);

   try {
    const testSocket = new WebSocket(environment.wsUrl.replace('http', 'ws') + '/socket.io/?transport=websocket');

    testSocket.onopen = () => {
     clearTimeout(timeout);
     testSocket.close();
     resolve(true);
    };

    testSocket.onerror = () => {
     clearTimeout(timeout);
     resolve(false);
    };
   } catch (error) {
    clearTimeout(timeout);
    resolve(false);
   }
  });
 }

 /**
  * Get comprehensive connection diagnostics
  */
 getConnectionDiagnostics(): Observable<{
  api: boolean;
  websockets: boolean;
  latency: number;
  serviceHealth: any;
  networkType?: string;
  timestamp: string;
 }> {
  const startTime = performance.now();

  return this.performHealthCheck().pipe(
   switchMap(status => {
    return Promise.all([
     this.testWebSocketConnection(),
     this.getServiceStatus().toPromise().catch(() => null)
    ]).then(([wsStatus, serviceHealth]) => ({
     api: status.isConnected,
     websockets: wsStatus,
     latency: performance.now() - startTime,
     serviceHealth,
     networkType: (navigator as any)?.connection?.effectiveType || 'unknown',
     timestamp: new Date().toISOString()
    }));
   })
  );
 }

 /**
  * Handle connection errors with appropriate user feedback
  */
 private handleConnectionError(error: any): void {
  let errorMessage = 'Connection failed';

  if (error instanceof HttpErrorResponse) {
   switch (error.status) {
    case 0:
     errorMessage = 'Backend server is not accessible. Please check your internet connection.';
     break;
    case 404:
     errorMessage = 'Backend service endpoint not found. Please check the configuration.';
     break;
    case 500:
     errorMessage = 'Backend server error. Please try again later.';
     break;
    case 503:
     errorMessage = 'Backend service is temporarily unavailable. Please try again later.';
     break;
    default:
     errorMessage = `Backend connection failed (${error.status}): ${error.message}`;
   }
  } else if (error.name === 'TimeoutError') {
   errorMessage = 'Connection timeout. Please check your internet connection.';
  } else {
   errorMessage = error.message || 'Unknown connection error';
  }

  console.error('❌ Connection error:', {
   error: errorMessage,
   details: error,
   retryAttempt: this.retryAttempts,
   maxRetries: this.maxRetryAttempts
  });
 }

 /**
  * Get user-friendly error message
  */
 private getErrorMessage(error: any): string {
  if (error instanceof HttpErrorResponse) {
   switch (error.status) {
    case 0:
     return 'No connection to backend server';
    case 404:
     return 'Backend service not found';
    case 500:
     return 'Backend server error';
    case 503:
     return 'Backend service unavailable';
    default:
     return `Backend error (${error.status})`;
   }
  }

  if (error.name === 'TimeoutError') {
   return 'Connection timeout';
  }

  return 'Connection error';
 }

 /**
  * Clean up resources
  */
 ngOnDestroy(): void {
  if (this.healthCheckTimer) {
   clearInterval(this.healthCheckTimer);
  }
 }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, timer, timeout } from 'rxjs';
import { catchError, retry, finalize } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface ConnectionStatus {
 isConnected: boolean;
 lastCheck: Date;
 errorMessage?: string;
 retryCount: number;
}

@Injectable({
 providedIn: 'root'
})
export class ConnectionMonitorService {
 private connectionStatus = new BehaviorSubject<ConnectionStatus>({
  isConnected: false,
  lastCheck: new Date(),
  retryCount: 0
 });

 public connectionStatus$ = this.connectionStatus.asObservable();

 constructor(private http: HttpClient) {
  this.startConnectionMonitoring();
 }

 private startConnectionMonitoring(): void {
  timer(0, 30000).subscribe(() => {
   this.checkConnection();
  });
 }

 private checkConnection(): void {
  const currentStatus = this.connectionStatus.value;

  this.http.get(`${environment.apiUrl}/health`)
   .pipe(
    timeout(10000), // 10 second timeout
    catchError((error: HttpErrorResponse) => {
     this.updateConnectionStatus({
      isConnected: false,
      lastCheck: new Date(),
      errorMessage: this.getErrorMessage(error),
      retryCount: currentStatus.retryCount + 1
     });
     return throwError(() => error);
    })
   )
   .subscribe({
    next: (response) => {
     this.updateConnectionStatus({
      isConnected: true,
      lastCheck: new Date(),
      errorMessage: undefined,
      retryCount: 0
     });
    },
    error: (error) => {
     console.error('Backend connection check failed:', error);
    }
   });
 }

 private updateConnectionStatus(status: ConnectionStatus): void {
  this.connectionStatus.next(status);

  if (status.isConnected) {
   console.log('✅ Backend connection restored');
  } else {
   console.error('❌ Backend connection lost:', status.errorMessage);
  }
 }

 private getErrorMessage(error: HttpErrorResponse): string {
  if (error.error instanceof ErrorEvent) {
   return `Network error: ${error.error.message}`;
  } else {
   switch (error.status) {
    case 0:
     return 'Backend server is not running or unreachable';
    case 404:
     return 'Backend endpoint not found';
    case 500:
     return 'Backend server error';
    default:
     return `Backend error: ${error.status} ${error.statusText}`;
   }
  }
 }

 /**
  * Enhanced HTTP request with automatic retry logic
  */
 public makeResilientRequest<T>(
  requestFn: () => Observable<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
 ): Observable<T> {
  return requestFn().pipe(
   retry({
    count: maxRetries,
    delay: (error, retryCount) => {
     console.log(`Retry attempt ${retryCount}/${maxRetries} in ${delayMs * retryCount}ms`);
     return timer(delayMs * retryCount); // Exponential backoff
    }
   }),
   catchError((error) => {
    console.error(`Request failed after ${maxRetries} attempts:`, error);
    return throwError(() => error);
   }),
   finalize(() => {
    setTimeout(() => this.checkConnection(), 1000);
   })
  );
 }

 /**
  * Get current connection status
  */
 public getCurrentStatus(): ConnectionStatus {
  return this.connectionStatus.value;
 }

 /**
  * Force a connection check
  */
 public forceConnectionCheck(): void {
  this.checkConnection();
 }
}

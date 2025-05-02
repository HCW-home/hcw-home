import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
  HttpResponse
} from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

@Injectable({ providedIn: 'root' })
export class ToastInterceptor implements HttpInterceptor {
  constructor(private toast: ToastService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      tap(event => {
        if (event instanceof HttpResponse) {
          // Show success toast for POST/PUT/DELETE operations
          if (req.method !== 'GET' && event.status >= 200 && event.status < 300) {
            const successMessage = event.body?.message || 'Operation completed successfully';
            this.toast.show(successMessage, 'success');
          }
        }
      }),
      catchError((error: HttpErrorResponse) => {
        const errorMessage = error.error?.message || 'An error occurred';
        this.toast.show(errorMessage, 'error');
        return throwError(() => error);
      })
    );
  }
} 
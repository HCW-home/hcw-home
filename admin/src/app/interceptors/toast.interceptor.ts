import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, catchError, tap } from 'rxjs';
import { ToastService } from '../services/toast.service';

@Injectable()
export class ToastInterceptor implements HttpInterceptor {
  constructor(private toast: ToastService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      tap(event => {
        // Optionally: Show success toasts for certain responses
      }),
      catchError((error: HttpErrorResponse) => {
        this.toast.show(error.error?.message || 'An error occurred', 'error');
        throw error;
      })
    );
  }
}

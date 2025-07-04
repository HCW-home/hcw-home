import { HttpInterceptorFn, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { AuthService } from './auth.service';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { SnackbarService } from '../services/snackbar/snackbar.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  const snackbarService=inject(SnackbarService)

  // Clone request with token if available
  const authReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const isUnauthorized = error.status === 401;
      const tokenExpired =
        error?.error?.message === 'Invalid or expired token';

      const isRefreshRequest = req.url.includes('/refresh-token');

      // Attempt to refresh token if access token expired
      if (
        isUnauthorized &&
        tokenExpired &&
        !req.url.includes('/login') &&
        !isRefreshRequest
      ) {
        const refreshToken = authService.getrefreshToken();
        if (!refreshToken) return throwError(() => error);

        return authService.refreshToken().pipe(
          switchMap(() => {
            const newToken = authService.getToken();
            const retryReq: HttpRequest<any> = req.clone({
              setHeaders: {
                Authorization: `Bearer ${newToken}`,
              },
            });
            return next(retryReq);
          }),
          catchError((err) => {
            authService.logout();
            router.navigate(['/login']);
            return throwError(() => err);
          })
        );
      }

      //  If refresh token itself is expired
      if (isUnauthorized && isRefreshRequest && tokenExpired) {

        authService.logout();
        router.navigate(['/login']);
        snackbarService.showInfo("session expired,Login Again")
      }

      return throwError(() => error);
    })
  );
};

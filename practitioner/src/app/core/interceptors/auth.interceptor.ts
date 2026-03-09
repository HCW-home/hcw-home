import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
  HttpContextToken,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Auth } from '../services/auth';
import { TranslationService } from '../services/translation.service';
import { ToasterService } from '../services/toaster.service';
import { OfflineService } from '../services/offline.service';
import { getErrorMessage } from '../utils/error-helper';

export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

function addAuthHeaders(
  req: HttpRequest<unknown>,
  token: string | null,
  lang: string
): HttpRequest<unknown> {
  let authReq = req.clone({
    headers: req.headers.set('Accept-Language', lang),
  });
  if (token) {
    authReq = authReq.clone({
      headers: authReq.headers.set('Authorization', `Bearer ${token}`),
    });
  }
  return authReq;
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const router = inject(Router);
  const auth = inject(Auth);
  const translationService = inject(TranslationService);
  const toasterService = inject(ToasterService);
  const offlineService = inject(OfflineService);

  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const token = auth.getToken();
  const lang = translationService.currentLanguage();
  const authReq = addAuthHeaders(req, token, lang);

  return next(authReq).pipe(
    tap(event => {
      // Track successful responses to detect when backend comes back online
      if (event instanceof HttpResponse && event.ok) {
        offlineService.setBackendOnline();
      }
    }),
    catchError((error: HttpErrorResponse) => {
      if (
        error.status === 401 &&
        error.error?.code === 'token_not_valid' &&
        auth.getRefreshToken() &&
        !req.url.includes('/auth/token/refresh/')
      ) {
        if (isRefreshing) {
          // Another refresh is already in progress, wait for it
          return refreshTokenSubject.pipe(
            filter((token): token is string => token !== null),
            take(1),
            switchMap(newToken => {
              const retryReq = addAuthHeaders(req, newToken, lang);
              return next(retryReq);
            })
          );
        }

        isRefreshing = true;
        refreshTokenSubject.next(null);

        return auth.refreshAccessToken().pipe(
          switchMap(response => {
            isRefreshing = false;
            auth.setToken(response.access);
            if (response.refresh) {
              auth.setRefreshToken(response.refresh);
            }
            refreshTokenSubject.next(response.access);
            const retryReq = addAuthHeaders(req, response.access, lang);
            return next(retryReq);
          }),
          catchError(refreshError => {
            isRefreshing = false;
            refreshTokenSubject.next(null);
            auth.removeToken();
            router.navigate(['/auth/login']);
            // Don't show network error toast for refresh token failures
            // The websocket disconnect message is sufficient
            return throwError(() => refreshError);
          })
        );
      }

      if (error.status === 401) {
        auth.removeToken();
        router.navigate(['/auth/login']);
      } else if (error.status === 0) {
        // Network error detected - signal backend is offline
        offlineService.setBackendOffline();

        // Only show network error toast for non-refresh-token requests
        // Refresh token network errors are silent to avoid double error messages
        if (!req.url.includes('/auth/token/refresh/')) {
          toasterService.show(
            'error',
            translationService.instant('common.networkError'),
            translationService.instant('common.networkErrorMessage')
          );
        }
      } else if (error.status >= 400 && !req.context.get(SKIP_ERROR_TOAST)) {
        const message = getErrorMessage(error);
        toasterService.show(
          'error',
          translationService.instant('common.errorStatus', {
            status: String(error.status),
          }),
          message
        );
      }
      return throwError(() => error);
    })
  );
};

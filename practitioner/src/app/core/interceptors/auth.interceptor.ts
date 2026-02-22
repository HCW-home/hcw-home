import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Auth } from '../services/auth';
import { TranslationService } from '../services/translation.service';
import { ToasterService } from '../services/toaster.service';
import { getErrorMessage } from '../utils/error-helper';

let isRefreshing = false;

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

  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const token = auth.getToken();
  const lang = translationService.currentLanguage();
  const authReq = addAuthHeaders(req, token, lang);

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (
        error.status === 401 &&
        error.error?.code === 'token_not_valid' &&
        !isRefreshing &&
        auth.getRefreshToken() &&
        !req.url.includes('/auth/token/refresh/')
      ) {
        isRefreshing = true;
        return auth.refreshAccessToken().pipe(
          switchMap(response => {
            isRefreshing = false;
            auth.setToken(response.access);
            const retryReq = addAuthHeaders(req, response.access, lang);
            return next(retryReq);
          }),
          catchError(refreshError => {
            isRefreshing = false;
            auth.removeToken();
            router.navigate(['/auth/login']);
            return throwError(() => refreshError);
          })
        );
      }

      if (error.status === 401 && error.error?.code === 'token_not_valid') {
        auth.removeToken();
        router.navigate(['/auth/login']);
      } else if (error.status === 0) {
        toasterService.show(
          'error',
          translationService.instant('common.networkError'),
          translationService.instant('common.networkErrorMessage')
        );
      } else if (error.status >= 400) {
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

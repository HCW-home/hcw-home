import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { TranslationService } from '../services/translation.service';
import { NavController } from '@ionic/angular';

let isRefreshing = false;

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private translationService: TranslationService,
    private navCtrl: NavController
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const lang = this.translationService.currentLanguage();
    request = request.clone({
      setHeaders: { 'Accept-Language': lang }
    });

    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        if (token) {
          request = this.addToken(request, token);
        }
        return next.handle(request).pipe(
          catchError(error => {
            if (
              error instanceof HttpErrorResponse &&
              error.status === 401 &&
              error.error?.code === 'token_not_valid' &&
              !isRefreshing &&
              !request.url.includes('/auth/token/refresh/')
            ) {
              return from(this.authService.getRefreshToken()).pipe(
                switchMap(refreshToken => {
                  if (!refreshToken) {
                    this.forceLogout();
                    return throwError(() => error);
                  }

                  isRefreshing = true;
                  return this.authService.refreshToken().pipe(
                    switchMap(response => {
                      isRefreshing = false;
                      const retryReq = this.addToken(request, response.access);
                      return next.handle(retryReq);
                    }),
                    catchError(refreshError => {
                      isRefreshing = false;
                      this.forceLogout();
                      return throwError(() => refreshError);
                    })
                  );
                })
              );
            }

            if (
              error instanceof HttpErrorResponse &&
              error.status === 401 &&
              error.error?.code === 'token_not_valid'
            ) {
              this.forceLogout();
            }

            return throwError(() => error);
          })
        );
      })
    );
  }

  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  private forceLogout(): void {
    this.authService.logout().then(() => {
      this.navCtrl.navigateRoot('/login');
    });
  }
}

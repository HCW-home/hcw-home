import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, from, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { UserWebSocketService } from '../services/user-websocket.service';
import { TranslationService } from '../services/translation.service';
import { NavController } from '@ionic/angular';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private userWsService: UserWebSocketService,
    private translationService: TranslationService,
    private navCtrl: NavController
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const lang = this.translationService.currentLanguage();
    request = request.clone({
      setHeaders: { 'Accept-Language': lang }
    });

    const skipAuth = request.url.includes('/auth/token/') || request.url.includes('/auth/login/') || request.url.includes('/auth/send-verification-code/');

    return from(skipAuth ? Promise.resolve(null) : this.authService.getToken()).pipe(
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
              !request.url.includes('/auth/token/refresh/')
            ) {
              return from(this.authService.getRefreshToken()).pipe(
                switchMap(refreshToken => {
                  if (!refreshToken) {
                    this.forceLogout();
                    return throwError(() => error);
                  }

                  if (isRefreshing) {
                    // Another refresh is already in progress, wait for it
                    return refreshTokenSubject.pipe(
                      filter((token): token is string => token !== null),
                      take(1),
                      switchMap(newToken => {
                        const retryReq = this.addToken(request, newToken);
                        return next.handle(retryReq);
                      })
                    );
                  }

                  isRefreshing = true;
                  refreshTokenSubject.next(null);

                  return this.authService.refreshToken().pipe(
                    switchMap(response => {
                      isRefreshing = false;
                      refreshTokenSubject.next(response.access);
                      const retryReq = this.addToken(request, response.access);
                      return next.handle(retryReq);
                    }),
                    catchError(refreshError => {
                      isRefreshing = false;
                      refreshTokenSubject.next(null);
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
    this.userWsService.disconnect();
    this.authService.logout().then(() => {
      this.navCtrl.navigateRoot('/login');
    });
  }
}

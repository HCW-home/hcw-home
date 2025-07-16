import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { provideAngularSvgIcon } from 'angular-svg-icon';
import { authInterceptor } from './auth/auth.interceptor';
import { GuidedTourService} from 'ngx-guided-tour';
import { WindowRefService } from 'ngx-guided-tour';
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAngularSvgIcon(),
    GuidedTourService,
    WindowRefService,
  ],
};

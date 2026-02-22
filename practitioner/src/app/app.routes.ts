import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { RoutePaths } from './core/constants/routes';
import {
  redirectIfAuthenticated,
  redirectIfUnauthenticated,
  redirectIfTermsNotAccepted,
  redirectIfFirstLogin,
} from './core/services/auth.guard';

export const routes: Routes = [
  {
    path: RoutePaths.VERIFY_INVITE,
    loadComponent: () =>
      import('./pages/verify-invite/verify-invite').then(c => c.VerifyInvite),
  },
  {
    path: RoutePaths.CONFIRM_PRESENCE,
    loadComponent: () =>
      import('./pages/confirm-presence/confirm-presence').then(
        c => c.ConfirmPresence
      ),
  },
  {
    path: `${RoutePaths.CONFIRM_PRESENCE}/:id`,
    canActivate: [
      () => {
        const router = inject(Router);
        const url = router.getCurrentNavigation()?.extractedUrl;
        const segments = url?.root.children['primary']?.segments;
        const participantId = segments?.[segments.length - 1]?.path;
        if (participantId) {
          return router.createUrlTree(
            [`/${RoutePaths.USER}/${RoutePaths.APPOINTMENTS}`],
            { queryParams: { participantId } }
          );
        }
        return router.createUrlTree([
          `/${RoutePaths.USER}/${RoutePaths.APPOINTMENTS}`,
        ]);
      },
    ],
    loadComponent: () =>
      import('./pages/confirm-presence/confirm-presence').then(
        c => c.ConfirmPresence
      ),
  },
  {
    path: RoutePaths.CGU,
    loadComponent: () => import('./pages/cgu/cgu').then(c => c.CguPage),
    canMatch: [redirectIfUnauthenticated],
  },
  {
    path: RoutePaths.ONBOARDING,
    loadComponent: () =>
      import('./pages/onboarding/onboarding').then(c => c.OnboardingPage),
    canMatch: [redirectIfUnauthenticated],
  },
  {
    path: RoutePaths.AUTH,
    loadChildren: () =>
      import('./modules/auth/auth-module').then(c => c.AuthModule),
    canMatch: [redirectIfAuthenticated],
  },
  {
    path: RoutePaths.USER,
    loadChildren: () =>
      import('./modules/user/user-module').then(c => c.UserModule),
    canMatch: [redirectIfUnauthenticated],
    canActivate: [redirectIfTermsNotAccepted, redirectIfFirstLogin],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: RoutePaths.AUTH,
  },
  {
    path: '**',
    redirectTo: RoutePaths.AUTH,
  },
];

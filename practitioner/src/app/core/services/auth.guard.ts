import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../constants/routes';
import { UserService } from './user.service';

export const redirectIfAuthenticated: CanMatchFn = () => {
  const token = localStorage.getItem('token');
  const router = inject(Router);

  if (token) {
    router.navigate([`/${RoutePaths.USER}`]);
    return false;
  }

  return true;
};

export const redirectIfUnauthenticated: CanMatchFn = () => {
  const token = localStorage.getItem('token');
  const router = inject(Router);

  if (!token) {
    router.navigate([`/${RoutePaths.AUTH}`]);
    return false;
  }

  return true;
};

export const redirectIfFirstLogin: CanActivateFn = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return true;
  }

  const userService = inject(UserService);
  const router = inject(Router);

  try {
    let user = userService.currentUserValue;
    if (!user) {
      user = await firstValueFrom(userService.getCurrentUser());
    }

    if (user?.is_first_login) {
      return router.createUrlTree([`/${RoutePaths.ONBOARDING}`]);
    }
  } catch {
    return true;
  }

  return true;
};

export const redirectIfTermsNotAccepted: CanActivateFn = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return true;
  }

  const userService = inject(UserService);
  const router = inject(Router);

  try {
    let user = userService.currentUserValue;
    if (!user) {
      user = await firstValueFrom(userService.getCurrentUser());
    }

    const requiredTermId = user?.main_organisation?.default_term;
    if (requiredTermId == null) {
      return true;
    }

    if (user.accepted_term !== requiredTermId) {
      return router.createUrlTree([`/${RoutePaths.CGU}`]);
    }
  } catch {
    return true;
  }

  return true;
};

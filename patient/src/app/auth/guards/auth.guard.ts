import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { RoutePaths } from '../../constants/route-path.enum';
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private router: Router,
    private authService: AuthService
  ) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    const currentUser = this.authService.getCurrentUser();

    if (currentUser) {
      return true;
    }


    this.router.navigate([RoutePaths.Login], { queryParams: { returnUrl: state.url } });
    return false;
  }
}

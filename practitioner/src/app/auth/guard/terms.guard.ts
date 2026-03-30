import { Injectable } from '@angular/core';
import {
  Router,
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { RoutePaths } from '../../constants/route-paths.enum';
import { TermService } from '../../services/term.service';
import { ToastService } from '../../services/toast/toast.service';
import { AuthService } from '../auth.service';

@Injectable({ providedIn: 'root' })
export class TermGuard implements CanActivate {
  constructor(
    private router: Router,
    private termService: TermService,
    private authService: AuthService,
    private toast: ToastService
  ) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const latest = this.termService.getLatestTrem();
    const isLoggedIn = this.authService.isLoggedIn();

    if (isLoggedIn && latest) {
      this.toast.showError('Please accept the latest terms before proceeding');
      this.router.navigate([RoutePaths.AcceptTerm], {
        queryParams: { returnUrl: state.url },
      });
      return false;
    }

    return true;
  }
}

import { Routes } from '@angular/router';
import { UsersComponent } from './users/users.component';
import { RoutePaths } from './constants/route-path.enum';
import { UserFormComponent } from './user-form/user-form.component';
import { ResourceManagerComponent } from './resource-manager/resource-manager.component';
import { TermsComponent } from './terms/terms.component';
import { TermFormComponent } from './term-form/term-form.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './login/login.component';
import { AuthGuard } from './auth/guard/auth.guard';
import { AvailabilityComponent } from './availability/availability.component';
import { ForgotPasswordComponent } from './shared/components/forget-password/forget-password.component';

export const routes: Routes = [
    { path: '', redirectTo: RoutePaths.Dashboard, pathMatch: 'full' },
    { path: RoutePaths.Login, component: LoginComponent },
    {
      path:RoutePaths.FogetPassword,
      component:ForgotPasswordComponent
    },
  
    // Protected routes
    { path: RoutePaths.Dashboard, component: DashboardComponent, canActivate: [AuthGuard] },
    { path: RoutePaths.Users, component: UsersComponent, canActivate: [AuthGuard] },
    { path: RoutePaths.NewUser, component: UserFormComponent, canActivate: [AuthGuard] },
    { path: 'user/:id', component: UserFormComponent, canActivate: [AuthGuard] },
    { path: RoutePaths.ResourceManager, component: ResourceManagerComponent, canActivate: [AuthGuard] },
    { path: RoutePaths.Terms, component: TermsComponent, canActivate: [AuthGuard] },
    { path: RoutePaths.newTerm, component: TermFormComponent, canActivate: [AuthGuard] },
    { path: 'term/:id', component: TermFormComponent, canActivate: [AuthGuard] },
    { path: RoutePaths.Availability, component: AvailabilityComponent, canActivate: [AuthGuard] }
  ];
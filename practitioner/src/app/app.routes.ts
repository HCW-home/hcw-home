import type { Routes } from '@angular/router';
import { InviteFormComponent } from './features/consultation/invite-form/invite-form.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AppComponent } from './app.component';
import { RoutePaths } from './constants/route-paths.enum';

// export const routes: Routes = [
//   {
//     path: '',
//     component: AppComponent,
//     children: [
//       { path: '', redirectTo: RoutePaths.Dashboard, pathMatch: 'full' },
//       { path: RoutePaths.Dashboard, component: DashboardComponent },
//     ],
//   },
// ];
export const routes: Routes = [
  { path: 'invite', component: InviteFormComponent },
  { path: '', redirectTo: 'invite', pathMatch: 'full' }
];

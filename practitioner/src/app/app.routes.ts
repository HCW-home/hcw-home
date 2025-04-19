import type { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AppComponent } from './app.component';
import { RoutePaths } from './constants/route-paths.enum';
import { TestCallComponent } from './test-call/test-call.component';
export const routes: Routes = [
  {
    path: '',
    component: AppComponent,
    children: [
      { path: '', redirectTo: RoutePaths.Dashboard, pathMatch: 'full' },
      { path: 'test-call', component: TestCallComponent },
      { path: RoutePaths.Dashboard, component: DashboardComponent },
    ],
  },
];

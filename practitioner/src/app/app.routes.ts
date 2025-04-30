import type { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AppComponent } from './app.component';
import { RoutePaths } from './constants/route-paths.enum';
import { ToastTestComponent } from './components/toast-test/toast-test.component';

export const routes: Routes = [
  {
    path: '',
    component: AppComponent,
    children: [
      { path: '', redirectTo: RoutePaths.Dashboard, pathMatch: 'full' },
      { path: RoutePaths.Dashboard, component: DashboardComponent },
      { path: 'toast-demo', component: ToastTestComponent },
    ],
  },
];

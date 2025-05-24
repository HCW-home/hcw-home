import type { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AppComponent } from './app.component';
import { RoutePaths } from './constants/route-paths.enum';
import { WaitingRoomComponent } from './waiting-room/waiting-room.component';

export const routes: Routes = [
  {
    path: '',
    component: AppComponent,
    children: [
      { path: '', redirectTo: RoutePaths.Dashboard, pathMatch: 'full' },
      { path: RoutePaths.Dashboard, component: DashboardComponent },
      { path: 'waiting-room', component: WaitingRoomComponent },
    ],
  },
];

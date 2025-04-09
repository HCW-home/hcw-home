import { Routes } from '@angular/router';
import { DashboardComponent } from './layout/dashboard/dashboard.component';
import { ConsultationHistoryComponent } from './features/consultation-history/consultation-history.component';
import { ConsultationDetailComponent } from './features/consultation-detail/consultation-detail.component';
import { WelcomeComponent } from './features/welcome/welcome.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        component: WelcomeComponent,
      },
      {
        path: 'history',
        component: ConsultationHistoryComponent,
      },
      {
        path: 'consultation/:id',
        component: ConsultationDetailComponent,
      },
      // Other routes will be added here
    ],
  },
];

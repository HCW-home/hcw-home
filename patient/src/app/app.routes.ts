import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'consultation/:id',
    loadComponent: () => import('./consultation/consultation.page').then(m => m.ConsultationPage)
  }
];

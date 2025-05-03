import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'recover-consultation',
    loadChildren: () => import('./recover-consultation/recover-consultation.module').then((m) => m.RecoverConsultationModule),
  },
];

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'book-consultation',
    loadComponent: () => import('./book-consultation/book-consultation.page').then(m => m.BookConsultationPage)
  }
];

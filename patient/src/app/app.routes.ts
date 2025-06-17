import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'consultation-request',
    loadComponent: () => import('./pages/consultation-request/consultation-request.page').then( m => m.ConsultationRequestPage)
  },
  {
    path: 'patient-dashboard',
    loadComponent: () => import('./pages/patient-dashboard/patient-dashboard.page').then( m => m.PatientDashboard)
  },
  {
    path: 'post-consultation-feedback',
    loadComponent: () => import('./pages/post-consultation-feedback/post-consultation-feedback.page').then( m => m.PostConsultationFeedbackPage)
  },
];

import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { TermsGuard } from './core/guards/terms.guard';
import { canDeactivateVideoCall } from './core/guards/video-call.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/forgot-password/forgot-password.page').then(m => m.ForgotPasswordPage)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password/reset-password.page').then(m => m.ResetPasswordPage)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./pages/verify-email/verify-email.page').then(m => m.VerifyEmailPage)
  },
  {
    path: 'verify-invite',
    loadComponent: () => import('./pages/verify-invite/verify-invite.page').then(m => m.VerifyInvitePage)
  },
  {
    path: 'confirm-presence',
    loadComponent: () => import('./pages/confirm-presence/confirm-presence.page').then(m => m.ConfirmPresencePage)
  },
  {
    path: 'confirm-presence/:id',
    loadComponent: () => import('./pages/confirm-presence/confirm-presence.page').then(m => m.ConfirmPresencePage)
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms.page').then(m => m.TermsPage),
    canActivate: [AuthGuard],
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'notifications',
    loadComponent: () => import('./pages/notifications/notifications.page').then(m => m.NotificationsPage),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.page').then(m => m.ProfilePage),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'new-request',
    loadComponent: () => import('./pages/new-request/new-request.page').then(m => m.NewRequestPage),
    canActivate: [AuthGuard, TermsGuard],
  },
  {
    path: 'consultation/:id/video',
    loadComponent: () => import('./pages/video-consultation/video-consultation.page').then(m => m.VideoConsultationPage),
    canActivate: [AuthGuard, TermsGuard],
    canDeactivate: [canDeactivateVideoCall],
  },
];

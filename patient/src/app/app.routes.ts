import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home.page';
import { ConsultationRequestPage } from './pages/consultation-request/consultation-request.page';
import { PatientDashboard } from './pages/patient-dashboard/patient-dashboard.page';
import { PostConsultationFeedbackPage } from './pages/post-consultation-feedback/post-consultation-feedback.page';
import { ChooseConsultationTimeslotPage } from './pages/choose-consultation-timeslot/choose-consultation-timeslot.page';
import { LoginPage } from './pages/login/login.page';
import { RoutePaths } from './constants/route-path.enum';
import { AuthGuard } from './auth/guards/auth.guard';
import { ProfileComponent } from './components/profile/profile.component';

export const routes: Routes = [
  {
    path: RoutePaths.Home,
    component: HomePage,
    canActivate: [AuthGuard],
  },
  {
    path: '',
    redirectTo: RoutePaths.Home,
    pathMatch: 'full',
  },
  {  
    path: RoutePaths.ConsultationRequest,
    component: ConsultationRequestPage,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.PatientDashboard,
    component: PatientDashboard,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.PostConsultationFeedback,
    component: PostConsultationFeedbackPage,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.ChooseConsultationTimeslot,
    component: ChooseConsultationTimeslotPage,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.Profile,
    component: ProfileComponent,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.Login,
    component: LoginPage,
  },
];

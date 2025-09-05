import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home.page';
import { PatientDashboard } from './pages/patient-dashboard/patient-dashboard.page';
import { PostConsultationFeedbackPage } from './pages/post-consultation-feedback/post-consultation-feedback.page';
import { ConsultationRequestPage } from './pages/consultation-request/consultation-request.page';
import { LoginPage } from './pages/login/login.page';
import { WaitingRoomPage } from './pages/waiting-room/waiting-room.page';
import { ConsultationRoomPage } from './pages/consultation-room/consultation-room.page';
import { JoinConsultationPage } from './pages/join-consultation/join-consultation.page';
import { RoutePaths } from './constants/route-path.enum';
import { AuthGuard } from './auth/guards/auth.guard';
import { ProfileComponent } from './components/profile/profile.component';
import { TermBoxComponent } from './components/term-box/term-box.component';
export const routes: Routes = [
  {
    path: '',
    redirectTo: RoutePaths.PatientDashboard,
    pathMatch: 'full',
  },
  {
    path: RoutePaths.Login,
    component: LoginPage,
  },
  {
    path: RoutePaths.PatientDashboard,
    component: PatientDashboard,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.Profile,
    component: ProfileComponent,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.ConsultationRequest,
    component: ConsultationRequestPage,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.PostConsultationFeedback,
    component: PostConsultationFeedbackPage,
    canActivate: [AuthGuard],
  },
  {
    path: 'waiting-room/:consultationId',
    component: WaitingRoomPage,
    canActivate: [AuthGuard],
  },
  {
    path: 'consultation-room/:consultationId',
    component: ConsultationRoomPage,
    canActivate: [AuthGuard],
  },
  {
    path: RoutePaths.JoinConsultation,
    component: JoinConsultationPage,
    canActivate: [AuthGuard], 
  },
  {
    path: 'join-consultation/:id',
    component: JoinConsultationPage,
    canActivate: [AuthGuard], 
  },
  {
    path: 'join-consultation/token/:token',
    component: JoinConsultationPage, 
  },
  // Terms and Legal Routes
  {
    path: RoutePaths.AcceptTerm,
    component: TermBoxComponent,
    canActivate: [AuthGuard],
  },
];

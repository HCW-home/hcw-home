import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { User } from './pages/user/user';
import { RoutePaths } from '../../core/constants/routes';
import { Dashboard } from './components/dashboard/dashboard';
import { Consultations } from './components/consultations/consultations';
import { ConsultationDetail } from './components/consultation-detail/consultation-detail';
import { ConsultationForm } from './components/consultation-form/consultation-form';
import { UserProfile } from './components/user-profile/user-profile';
import { Patients } from './components/patients/patients';
import { PatientDetail } from './components/patient-detail/patient-detail';
import { Appointments } from './components/appointments/appointments';
import { Availability } from './components/availability/availability';
import { canDeactivateVideoCall } from './guards/video-call.guard';

const routes: Routes = [
  {
    path: '',
    component: User,
    data: { ssr: false },
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: RoutePaths.DASHBOARD,
      },
      {
        path: RoutePaths.DASHBOARD,
        pathMatch: 'full',
        component: Dashboard,
      },
      {
        path: RoutePaths.CONSULTATIONS,
        pathMatch: 'full',
        component: Consultations,
      },
      {
        path: `${RoutePaths.CONSULTATIONS}/new`,
        component: ConsultationForm,
      },
      {
        path: `${RoutePaths.CONSULTATIONS}/:id/edit`,
        component: ConsultationForm,
      },
      {
        path: RoutePaths.CONSULTATION_DETAIL,
        component: ConsultationDetail,
        canDeactivate: [canDeactivateVideoCall],
      },
      {
        path: RoutePaths.PROFILE,
        pathMatch: 'full',
        component: UserProfile,
      },
      {
        path: RoutePaths.PATIENTS,
        pathMatch: 'full',
        component: Patients,
      },
      {
        path: RoutePaths.PATIENT_DETAIL,
        component: PatientDetail,
      },
      {
        path: RoutePaths.APPOINTMENTS,
        pathMatch: 'full',
        component: Appointments,
      },
      {
        path: RoutePaths.AVAILABILITY,
        pathMatch: 'full',
        component: Availability,
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UserRoutingModule {}

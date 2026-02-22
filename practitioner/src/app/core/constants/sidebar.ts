import { Sidebar } from '../models/sidebar';
import { RoutePaths } from './routes';

export const MenuItems: Sidebar[] = [
  {
    name: 'sidebar.dashboard',
    subtitle: 'sidebar.dashboardSubtitle',
    path: `/${RoutePaths.DASHBOARD}`,
    icon: 'dashboard.svg',
  },
  {
    name: 'sidebar.consultations',
    subtitle: 'sidebar.consultationsSubtitle',
    path: `/${RoutePaths.CONSULTATIONS}`,
    icon: 'stethoscope.svg',
  },
  {
    name: 'sidebar.patients',
    subtitle: 'sidebar.patientsSubtitle',
    path: `/${RoutePaths.PATIENTS}`,
    icon: 'user.svg',
  },
  {
    name: 'sidebar.appointments',
    subtitle: 'sidebar.appointmentsSubtitle',
    path: `/${RoutePaths.APPOINTMENTS}`,
    icon: 'clock.svg',
  },
  {
    name: 'sidebar.availability',
    subtitle: 'sidebar.availabilitySubtitle',
    path: `/${RoutePaths.AVAILABILITY}`,
    icon: 'calendar-days.svg',
  },
];

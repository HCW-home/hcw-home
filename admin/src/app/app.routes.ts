import { Routes } from '@angular/router';
import { ToastTestComponent } from './components/toast-test/toast-test.component';

export const routes: Routes = [
  { path: 'toast-demo', component: ToastTestComponent },
  // Default landing page will be determined by the actual application
  { path: '', redirectTo: '/toast-demo', pathMatch: 'full' }
];

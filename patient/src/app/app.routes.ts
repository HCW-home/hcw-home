import { Routes } from '@angular/router';
import { ToastTestComponent } from './components/toast-test/toast-test.component';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'toast-demo',
    component: ToastTestComponent
  }
];

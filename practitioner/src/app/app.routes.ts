import { Routes } from '@angular/router';
import { InviteFormComponent } from './features/consultation/invite-form/invite-form.component';

export const routes: Routes = [
  { path: 'invite', component: InviteFormComponent },
  { path: '', redirectTo: 'invite', pathMatch: 'full' }
];

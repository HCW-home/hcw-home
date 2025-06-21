import { Routes } from '@angular/router';
import { UsersComponent } from './users/users.component';
import { RoutePaths } from './constants/route-path.enum';
import { UserFormComponent } from './user-form/user-form.component';

export const routes: Routes = [
    { path: '', redirectTo: RoutePaths.Users, pathMatch: 'full' },
    { path: RoutePaths.NewUser, component: UserFormComponent},
    { path: RoutePaths.Users, component: UsersComponent },
];
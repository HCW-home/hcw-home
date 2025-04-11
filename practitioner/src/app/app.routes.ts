import type { Routes } from "@angular/router"
import { MainLayoutComponent } from "./layouts/main-layout/main-layout.component"
import { DashboardComponent } from "./dashboard/dashboard.component"
import { WaitingRoomComponent } from "./waiting-room/waiting-room.component"
import { OpenConsultationsComponent } from "./open-consultations/open-consultations.component"
import { ClosedConsultationsComponent } from "./closed-consultations/closed-consultations.component"
import { InvitesComponent } from "./invites/invites.component"
import { ProfileComponent } from "./profile/profile.component"
import { AppComponent } from "./app.component"


export const routes: Routes = [
  {
    path: "",
    component: MainLayoutComponent,
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      { path: "dashboard", component: DashboardComponent },
      { path: "waiting-room", component: WaitingRoomComponent },
      { path: "open-consultations", component: OpenConsultationsComponent },
      { path: "closed-consultations", component: ClosedConsultationsComponent },
      { path: "invites", component: InvitesComponent },
      { path: "profile", component: ProfileComponent },
    ],
  },
]

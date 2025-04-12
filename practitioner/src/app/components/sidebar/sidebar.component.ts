import { Component } from "@angular/core"
import { RouterLink, RouterLinkActive } from "@angular/router"
import { CommonModule } from "@angular/common"
import { BadgeComponent } from "../badge/badge.component"

interface SidebarItem {
  icon: string
  label: string
  route: string
  badge?: number
}

@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, BadgeComponent],
  templateUrl: "./sidebar.component.html",
  styleUrls: ["./sidebar.component.scss"],
})
export class SidebarComponent {
  sidebarItems: SidebarItem[] = [
    { icon: "icon-dashboard.svg", label: "Dashboard", route: "/dashboard" },
    { icon: "icon-queue.svg", label: "Waiting Room", route: "/waiting-room", badge: 4},
    { icon: "icon-open.svg", label: "Opened Consultations", route: "/open-consultations"},
    { icon: "icon-history.svg", label: "Consultation history", route: "/closed-consultations" },
    { icon: "icon-invite.svg", label: "Invites", route: "/invites" },
    { icon: "user-round-pen.svg", label: "Profile", route: "/profile" },
  ]
}

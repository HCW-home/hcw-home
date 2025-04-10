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
    { icon: "house.svg", label: "Dashboard", route: "/dashboard" },
    { icon: "users-round.svg", label: "Waiting Room", route: "/waiting-room" },
    { icon: "message-circle.svg", label: "Open Consultations", route: "/open-consultations", badge: 4 },
    { icon: "message-circle-off.svg", label: "Closed Consultations", route: "/closed-consultations" },
    { icon: "mail.svg", label: "Invitations", route: "/invites" },
    { icon: "user-round-pen.svg", label: "Profile", route: "/profile" },
  ]
}

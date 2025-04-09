import { Component } from "@angular/core"
import { RouterLink, RouterLinkActive } from "@angular/router"
import { CommonModule } from "@angular/common"

interface SidebarItem {
  icon: string
  label: string
  route: string
  badge?: number
}

@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: "./sidebar.component.html",
  styleUrls: ["./sidebar.component.scss"],
})
export class SidebarComponent {
  sidebarItems: SidebarItem[] = [
    { icon: "fa-home", label: "Dashboard", route: "/dashboard" },
    { icon: "fa-users", label: "Waiting Room", route: "/waiting-room" },
    { icon: "fa-comments", label: "Open Consultations", route: "/open-consultations", badge: 2 },
    { icon: "fa-history", label: "Closed Consultations", route: "/closed-consultations" },
    { icon: "fa-envelope", label: "Invitations", route: "/invites" },
    { icon: "fa-video", label: "Profile", route: "/profile" },
  ]
}

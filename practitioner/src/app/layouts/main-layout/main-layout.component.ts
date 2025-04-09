import { Component } from "@angular/core"
import { CommonModule } from "@angular/common"
import { RouterOutlet } from "@angular/router"
import { SidebarComponent } from "../../components/sidebar/sidebar.component"

@Component({
  selector: "app-main-layout",
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent],
  templateUrl: "./main-layout.component.html",
  styleUrls: ["./main-layout.component.scss"],
})
export class MainLayoutComponent {
  practitionerName = "Olivier Bitsch"

  startNextConsultation(): void {
    console.log("Starting next consultation")
  }
}

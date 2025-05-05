import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConsultationService } from './services/consultations/consultation.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'practitioner';
  
  constructor(private consultationService: ConsultationService) {}
  
  ngOnInit() {
    // TODO: Replace with actual authentication service
    // For now, hardcode a practitioner ID (this would come from auth service)
    const mockPractitionerId = 1; // Get from auth service in a real implementation
    
    // Initialize socket connection for the practitioner
    this.consultationService.initializeSocketConnection(mockPractitionerId);
  }
}

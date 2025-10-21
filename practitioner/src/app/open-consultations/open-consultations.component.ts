import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject, takeUntil, switchMap } from 'rxjs';
import {
  OpenConsultationService,
} from '../services/consultations/open-consultation.service';
import { OpenConsultation } from '../dtos/consultations/open-consultation.dto';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../components/ui/button/button.component';
import { ButtonVariant, ButtonSize } from '../constants/button.enums';
import { OpenConsultationCardComponent } from '../components/open-consultation-card/open-consultation-card.component';
import { OpenConsultationPanelComponent } from '../components/open-consultation-panel/open-consultation-panel.component';
import { OverlayComponent } from '../components/overlay/overlay.component';
import { UserService } from '../services/user.service';
import { DashboardWebSocketService } from '../services/dashboard-websocket.service';
import { EventBusService } from '../services/event-bus.service';

@Component({
  selector: 'app-open-consultations',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    OpenConsultationCardComponent,
    OpenConsultationPanelComponent,
    OverlayComponent,
  ],
  templateUrl: './open-consultations.component.html',
  styleUrls: ['./open-consultations.component.scss'],
})
export class OpenConsultationsComponent implements OnInit, OnDestroy {
  consultations: OpenConsultation[] = [];
  selectedConsultation: OpenConsultation | null = null;
  isLoading: boolean = false;
  currentPage: number = 1;
  totalPages: number = 1;
  totalConsultations: number = 0;
  showRightPanel: boolean = false;

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;

  private destroy$ = new Subject<void>();
  private practitionerId: number | null = null;

  constructor(
    private openConsultationService: OpenConsultationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private userService: UserService,
    private dashboardWebSocketService: DashboardWebSocketService,
    private eventBusService: EventBusService
  ) { }

  ngOnInit(): void {
    this.loadConsultations();
    this.setupWebSocketSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadConsultations(): void {
    this.isLoading = true;

    this.userService.getCurrentUser()
      .pipe(
        switchMap(user => {
          this.practitionerId = user.id;
          return this.openConsultationService.getOpenConsultations(user.id, this.currentPage);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          // BACKEND FIX NEEDED: The /consultation/open endpoint should only return 
          // consultations that have been ACCEPTED by the practitioner, not newly created ones.
          // Currently, newly created consultations are appearing here when they should 
          // only appear in the invites list until accepted.
          
          this.consultations = response.consultations;
          this.totalConsultations = response.total;
          this.currentPage = response.currentPage;
          this.totalPages = response.totalPages;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading consultations:', error);
          this.isLoading = false;
        },
      });
  }

  private setupWebSocketSubscriptions(): void {
    // Listen for consultation status updates
    this.eventBusService.on('consultation:status_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handleConsultationUpdate(data);
      });

    // Listen for consultation closed events (remove from open consultations)
    this.eventBusService.on('consultation:closed')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handleConsultationClosed(data);
      });

    // Listen for invite accepted events (add to open consultations)
    this.eventBusService.on('invite:accepted')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handleInviteAccepted(data);
      });

    // Listen for consultation started events (when practitioner joins consultation room)
    this.eventBusService.on('consultation:practitioner_joined')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handlePractitionerJoined(data);
      });

    // Listen for patient join events (for real-time updates)
    this.dashboardWebSocketService.patientJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification) => {
        this.handlePatientJoined(notification);
      });

    // Listen for waiting room updates
    this.dashboardWebSocketService.waitingRoomUpdateSubject
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.handleWaitingRoomUpdate(data);
      });
  }

  private handleConsultationUpdate(data: any): void {
    const consultationIndex = this.consultations.findIndex(c => c.id === data.consultationId);
    if (consultationIndex !== -1) {
      // Update existing consultation
      this.consultations[consultationIndex] = { ...this.consultations[consultationIndex], ...data.updates };
      this.cdr.detectChanges();
    }
  }

  private handleConsultationClosed(data: any): void {
    // Remove consultation from open consultations list
    this.consultations = this.consultations.filter(c => c.id !== data.consultationId);
    this.totalConsultations = Math.max(0, this.totalConsultations - 1);
    
    // Close detail panel if the closed consultation was selected
    if (this.selectedConsultation?.id === data.consultationId) {
      this.closeRightPanel();
    }
    
    this.cdr.detectChanges();
  }

  private handleInviteAccepted(data: any): void {
    // When an invite is accepted, the consultation should now appear in open consultations
    if (data.practitionerId === this.practitionerId) {
      console.log('Invite accepted - consultation should now appear in open consultations:', data);
      this.loadConsultations();
    }
  }

  private handlePractitionerJoined(data: any): void {
    // When practitioner joins a consultation room, update the consultation status
    if (data.practitionerId === this.practitionerId) {
      console.log('Practitioner joined consultation room:', data);
      // Update the specific consultation or refresh the list
      this.loadConsultations();
    }
  }

  private handlePatientJoined(notification: any): void {
    // Find if this consultation is in our open consultations
    const consultationIndex = this.consultations.findIndex(c => c.id === notification.consultationId);
    if (consultationIndex !== -1) {
      // Update patient status or add visual indicator
      // Note: We can add a visual indicator or refresh the consultation data
      // For now, we'll just trigger a change detection to update the UI
      this.cdr.detectChanges();
    }
  }

  private handleWaitingRoomUpdate(data: any): void {
    // Update consultation status based on waiting room changes
    if (data.consultationId) {
      const consultationIndex = this.consultations.findIndex(c => c.id === data.consultationId);
      if (consultationIndex !== -1) {
        // Note: We can update consultation data or trigger a UI refresh
        // For now, we'll just trigger a change detection to update the UI
        this.cdr.detectChanges();
      }
    }
  }

  onConsultationClick(consultation: OpenConsultation): void {
    console.log('Consultation clicked:', consultation);
    this.selectedConsultation = consultation;
    this.showRightPanel = true;
    this.cdr.detectChanges();
  }

  onSendInvitation(consultationId: number): void {
    this.openConsultationService
      .sendInvitation(consultationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            console.log('Invitation sent successfully');
            this.loadConsultations();
          }
        },
        error: (error) => {
          console.error('Error sending invitation:', error);
        },
      });
  }

  onJoinConsultation(consultationId: number): void {
    if (!this.practitionerId) {
      console.error('Practitioner ID not available');
      return;
    }

    this.openConsultationService
      .joinConsultation(consultationId, this.practitionerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.router.navigate(['/consultation-room', consultationId], {
              queryParams: { practitionerId: this.practitionerId }
            });
          } else {
            console.error('Failed to join consultation:', response.message);
          }
        },
        error: (error) => {
          console.error('Error joining consultation:', error);
        },
      });
  }

  onCloseConsultation(consultationId: number): void {
    if (!this.practitionerId) {
      console.error('Practitioner ID not available');
      return;
    }

    if (confirm('Are you sure you want to close this consultation?')) {
      this.openConsultationService
        .closeConsultation(consultationId, this.practitionerId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.loadConsultations();
              this.closeRightPanel();
            }
          },
          error: (error) => {
            console.error('Error closing consultation:', error);
          },
        });
    }
  }

  closeRightPanel(): void {
    this.showRightPanel = false;
    this.selectedConsultation = null;
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadConsultations();
    }
  }

  getPaginationPages(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(
      1,
      this.currentPage - Math.floor(maxVisiblePages / 2)
    );
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }
}

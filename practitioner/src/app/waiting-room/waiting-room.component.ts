import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastService } from '../services/toast/toast.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WaitingRoomResponse, WaitingRoomItem } from '../dtos/consultations/consultation-dashboard-response.dto';
import { Subject, takeUntil } from 'rxjs';
import { ConsultationService } from '../services/consultations/consultation.service';
import { UserService } from '../services/user.service';
import { DashboardWebSocketService, WaitingRoomNotification } from '../services/dashboard-websocket.service';
import { EventBusService } from '../services/event-bus.service';
import { AudioAlertService } from '../services/audio-alert.service';


@Component({
  selector: 'app-waiting-room',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './waiting-room.component.html',
  styleUrls: ['./waiting-room.component.scss']
})
export class WaitingRoomComponent implements OnInit, OnDestroy {
  constructor(
    private consultationService: ConsultationService,
    private router: Router,
    private dashboardWebSocketService: DashboardWebSocketService,
    private eventBus: EventBusService,
    private userService: UserService,
    private toast: ToastService,
    private audioAlertService: AudioAlertService
  ) { }
  realTimeConnected: boolean = true;
  reconnecting: boolean = false;
  sortOption: string = 'queue';
  filterText: string = '';

  // Helper for filtered and sorted items
  filteredAndSortedItems(): WaitingRoomItem[] {
    let items = this.waitingRoomItems;
    // Filter by name or ID
    if (this.filterText) {
      const text = this.filterText.toLowerCase();
      items = items.filter(item =>
        (item.patientInitials && item.patientInitials.toLowerCase().includes(text)) ||
        (item.id && item.id.toString().includes(text))
      );
    }
    if (this.sortOption === 'wait') {
      items = [...items].sort((a, b) => {
        const aTime = a.joinTime ? new Date(a.joinTime).getTime() : 0;
        const bTime = b.joinTime ? new Date(b.joinTime).getTime() : 0;
        return bTime - aTime;
      });
    } else if (this.sortOption === 'language') {
      items = [...items].sort((a, b) => (a.language || '').localeCompare(b.language || ''));
    } else {
      items = [...items].sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0));
    }
    return items;
  }

  // Bulk actions helpers
  hasSelected(): boolean {
    return this.waitingRoomItems.some(item => item.selected);
  }
  admitSelected(): void {
    const selected = this.waitingRoomItems.filter(item => item.selected);
    selected.forEach(item => this.enterConsultation(item.id));
  }
  async messageSelected(): Promise<void> {
    const selected = this.waitingRoomItems.filter(item => item.selected);
    if (selected.length === 0) {
      this.toast.showError('No patients selected for messaging.', 4000);
      return;
    }
    try {
      for (const item of selected) {
        await this.consultationService.sendMessageToPatient(item.id, `Message from practitioner at ${new Date().toLocaleString()}`);
      }
      this.toast.showSuccess('Message sent to: ' + selected.map(i => i.patientInitials).join(', '), 4000);
    } catch (err) {
      this.toast.showError('Failed to send message.', 4000);
    }
  }

  async dismissSelected(): Promise<void> {
    const selected = this.waitingRoomItems.filter(item => item.selected);
    if (selected.length === 0) {
      this.toast.showError('No patients selected for dismissal.', 4000);
      return;
    }
    try {
      for (const item of selected) {
        await this.consultationService.dismissPatientFromWaitingRoom(item.id);
        item.selected = false;
        this.waitingRoomItems = this.waitingRoomItems.filter(i => i.id !== item.id);
      }
      this.updateQueuePositions();
      this.toast.showSuccess('Dismissed: ' + selected.map(i => i.patientInitials).join(', '), 4000);
    } catch (err) {
      this.toast.showError('Failed to dismiss patient.', 4000);
    }
  }
  newPatientBadge = false;
  private destroy$ = new Subject<void>();
  practitionerId: number | null = null;
  waitingRoomItems: WaitingRoomItem[] = [];
  isLoading = true;
  error: string | null = null;
  currentPage = 1;
  totalPages = 0;
  totalCount = 0;

  isRealTimeActive(): boolean {
    return this.realTimeConnected;
  }

  getConnectionStatus(): string {
    return this.realTimeConnected ? 'Connected' : (this.reconnecting ? 'Reconnecting...' : 'Offline');
  }

  reconnectWebSocket(): void {
    this.reconnecting = true;
    this.error = null;
    this.initializeDashboardWebSocket();
    setTimeout(() => {
      this.reconnecting = false;
      this.realTimeConnected = true;
    }, 2000);
  }

  getStatusMessage(): string {
    if (this.error) return this.error;
    if (this.reconnecting) return 'Reconnecting...';
    return this.realTimeConnected ? 'Connected' : 'Offline';
  }

  ngOnInit(): void {
    // Resolve practitioner id from current user, then initialize socket and load data
    this.userService.getCurrentUser().subscribe({
      next: (user) => {
        this.practitionerId = user?.id ?? null;
        if (this.practitionerId !== null) {
          this.initializeDashboardWebSocket();
          this.setupRealTimeUpdates();
          this.loadWaitingRoom();
        } else {
          this.toast.showError('Unable to determine practitioner id', 4000);
          this.isLoading = false;
        }
      },
      error: () => {
        this.toast.showError('Failed to load waiting room', 4000);
        this.isLoading = false;
      }
    });
    // Listen for assigned notifications via EventBus
    this.eventBus.on('dashboard:waiting_room_consultation_assigned')
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification: WaitingRoomNotification) => {
        this.handleAssignedNotification(notification);
      });

    // Listen for patient_joined events for real-time updates
    this.eventBus.on('dashboard:patient_joined')
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification: WaitingRoomNotification) => {
        this.handlePatientJoined(notification);
      });

    // Listen for actionable patient toasts (clickable)
    this.eventBus.on('dashboard:patient_actionable')
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload: any) => {
        const message = `${payload.patientFirstName ?? 'Patient'} is waiting` + (payload.requestId ? ` (id: ${payload.requestId})` : '');
        this.eventBus.emit('toast:show', { message });
        this.toast.show(
          `${message} (Click to open consultation)`,
          5000,
          undefined,
          {
            label: 'Open',
            callback: () => {
              if (payload.consultationId) {
                this.enterConsultation(payload.consultationId);
              }
            }
          }
        );
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Format join time for display
   */
  getJoinTimeFormatted(joinTime: Date | null): string {
    if (!joinTime) return '';
    return joinTime.toLocaleString();
  }

  /**
   * Check if consultation is stale (e.g., waiting too long)
   */
  isConsultationStale(joinTime: Date | null): boolean {
    if (!joinTime) return false;
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - joinTime.getTime()) / 60000);
    return diffMins > 30; // Mark as stale if waiting more than 30 minutes
  }

  /**
   * Get queue status for a waiting room entry
   */
  getQueueStatus(entry: WaitingRoomItem): string {
    return entry.queuePosition === 1 ? 'Next' : `#${entry.queuePosition}`;
  }

  /**
   * Get estimated wait time for a waiting room entry
   */
  getEstimatedWaitTime(entry: WaitingRoomItem): string {
    return entry.estimatedWaitTime;
  }

  /**
   * Handler for joining a consultation from the waiting room
   */
  onJoinConsultation(entry: WaitingRoomItem): void {
    this.enterConsultation(entry.id);
  }

  /**
   * Alias for refresh to match template usage
   */
  onRefresh(): void {
    this.loadWaitingRoom();
  }

  /**
   * Load waiting room consultations
   */
  private loadWaitingRoom(): void {
    this.consultationService.getWaitingRoomConsultations(this.practitionerId as number, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.waitingRoomItems = (response.waitingRooms || []).map((item: WaitingRoomItem) => ({
              ...item,
              joinTime: item.joinTime instanceof Date ? item.joinTime : (item.joinTime ? new Date(item.joinTime) : null),
              selected: false // For bulk actions
            }));
            this.totalPages = response.totalPages || 0;
            this.totalCount = response.totalCount || 0;
            this.error = null;
          } else {
            this.toast.showError('Failed to load waiting room', 4000);
          }
          this.isLoading = false;
        },
        error: () => {
          this.toast.showError('Failed to load waiting room', 4000);
          this.isLoading = false;
        }
      });
  }

  /**
   * Initialize dashboard WebSocket connection
   */
  private initializeDashboardWebSocket(): void {
    // Use the correct initialization method from DashboardWebSocketService
    if (typeof (this.dashboardWebSocketService as any).initializeDashboardConnection === 'function') {
      (this.dashboardWebSocketService as any).initializeDashboardConnection(this.practitionerId as number)
        .catch(() => {
          this.toast.showError('Real-time updates unavailable', 4000);
        });
    }
  }

  /**
   * Setup real-time waiting room updates
   */
  private setupRealTimeUpdates(): void {
    // Listen for new patients joining
    this.dashboardWebSocketService.patientJoinedSubject
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification: WaitingRoomNotification) => {
        this.handlePatientJoined(notification);
      });

    // Listen for patients leaving
    this.dashboardWebSocketService.patientLeftSubject
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handlePatientLeft(data);
      });

    // Listen for waiting room updates
    this.dashboardWebSocketService.waitingRoomUpdateSubject
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handleWaitingRoomUpdate(data);
      });

    // Listen for dashboard state changes
    if (typeof (this.dashboardWebSocketService as any).dashboardState$ === 'function' || (this.dashboardWebSocketService as any).dashboardState$) {
      (this.dashboardWebSocketService as any).dashboardState$
        .pipe(takeUntil(this.destroy$))
        .subscribe((state: any) => {
          this.realTimeConnected = !!state.isConnected;
          if (!state.isConnected) {
            this.toast.showError('Real-time connection lost. Refreshing...', 4000);
            this.realTimeConnected = false;
            setTimeout(() => this.loadWaitingRoom(), 1000);
          }
        });
    }
  }

  /**
   * Handle new patient joining waiting room with real-time updates and sound alert
   */
  private handlePatientJoined(notification: WaitingRoomNotification): void {
    // Play sound alert for new patient
    this.audioAlertService.playNotificationSound({ type: 'patient_joined' });
    this.newPatientBadge = true;

    const existingIndex = this.waitingRoomItems.findIndex(
      item => item.id === notification.consultationId
    );

    if (existingIndex === -1) {
      // Add new patient to waiting room items immediately
      const newItem: WaitingRoomItem = {
        id: notification.consultationId,
        patientInitials: notification.patientInitials || this.generateInitials(notification.patientFirstName),
        joinTime: notification.joinTime instanceof Date ? notification.joinTime : (notification.joinTime ? new Date(notification.joinTime) : new Date()),
        language: notification.language || null,
        queuePosition: this.waitingRoomItems.length + 1,
        estimatedWaitTime: this.calculateEstimatedWaitTime(this.waitingRoomItems.length + 1),
        selected: false
      };

      this.waitingRoomItems.unshift(newItem); // Add to top of list
      this.updateQueuePositions();
      this.totalCount++;

      // Show immediate notification with action
      this.toast.showSuccessWithAction(
        `${notification.patientFirstName || 'Patient'} joined the waiting room`,
        'View',
        () => {
          if (notification.consultationId) {
            this.enterConsultation(notification.consultationId);
          }
        },
        6000
      );

      // Refresh data from server to ensure consistency
      setTimeout(() => {
        this.loadWaitingRoom();
      }, 1000);
    }
  }

  /**
   * Generate initials from patient name
   */
  private generateInitials(name: string): string {
    if (!name) return 'P';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }

  private playPatientJoinedSound(): void {
    const audio = new Audio('/assets/sounds/patient-joined.mp3');
    audio.play().catch(() => { });
  }

  clearNewPatientBadge(): void {
    this.newPatientBadge = false;
  }

  /**
   * Handle patient leaving waiting room
   */
  private handlePatientLeft(data: any): void {
    const consultationId = data.consultationId || data.id;
    const index = this.waitingRoomItems.findIndex(item => item.id === consultationId);
    if (index !== -1) {
      this.waitingRoomItems.splice(index, 1);
      this.updateQueuePositions();
      this.totalCount = Math.max(0, this.totalCount - 1);
      this.toast.showInfo(`Patient removed from waiting room: ${consultationId}`, 4000);
    }
  }

  /**
   * Handle general waiting room updates
   */
  private handleWaitingRoomUpdate(data: any): void {
    // Refresh the waiting room data when significant updates occur
    if (data.type === 'refresh' || data.refreshRequired) {
      this.loadWaitingRoom();
    }
  }

  private handleAssignedNotification(notification: WaitingRoomNotification) {
    this.loadWaitingRoom();
    this.toast.showInfo(`Consultation ${notification.consultationId} assigned — refreshing list`, 4000);
  }

  /**
   * Update queue positions for all patients
   */
  private updateQueuePositions(): void {
    this.waitingRoomItems.forEach((item, index) => {
      item.queuePosition = index + 1;
      item.estimatedWaitTime = this.calculateEstimatedWaitTime(index + 1);
    });
  }

  /**
   * Calculate estimated wait time based on queue position
   */
  private calculateEstimatedWaitTime(position: number): string {
    const avgConsultationTime = 15; // 15 minutes average
    const waitMinutes = (position - 1) * avgConsultationTime;
    if (waitMinutes === 0) {
      return 'Next';
    } else if (waitMinutes < 60) {
      return `${waitMinutes} min`;
    } else {
      const hours = Math.floor(waitMinutes / 60);
      const mins = waitMinutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
  }

  /**
   * Enter consultation from waiting room
   */
  async enterConsultation(consultationId: number): Promise<void> {
    try {
      this.router.navigate(['/consultation-room', consultationId], {
        queryParams: { practitionerId: this.practitionerId }
      });
    } catch {
      this.toast.showError('Navigation error', 4000);
    }
  }

  /**
   * Get relative time for join time
   */
  getRelativeTime(joinTime: Date | null): string {
    if (!joinTime) return 'Unknown';
    const now = new Date();
    const diffMs = now.getTime() - joinTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  }

  /**
   * Get priority class based on wait time
   */
  getPriorityClass(joinTime: Date | null): string {
    if (!joinTime) return '';
    const now = new Date();
    const diffMs = now.getTime() - joinTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins > 15) return 'priority-high';
    if (diffMins > 10) return 'priority-medium';
    return 'priority-normal';
  }

  /**
   * Navigate to previous page
   */
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadWaitingRoom();
    }
  }

  /**
   * Navigate to next page
   */
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadWaitingRoom();
    }
  }

  /**
   * Get the number of patients currently waiting
   */
  getWaitingPatientsCount(): number {
    return this.waitingRoomItems.length;
  }

  /**
   * TrackBy function for ngFor to optimize rendering
   */
  trackByPatientId(index: number, item: WaitingRoomItem): number {
    return item.id;
  }
}

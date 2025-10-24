import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { InvitesService, Invite, InvitesResponse } from '../services/invites.service';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ToastService, ToastType } from '../services/toast/toast.service';
import { DashboardWebSocketService } from '../services/dashboard-websocket.service';
import { UserService } from '../services/user.service';
import { InviteFormComponent } from '../components/invite-form/invite-form.component';
import { InviteFormData } from '../dtos/invites';

@Component({
  selector: 'app-invites',
  standalone: true,
  imports: [CommonModule, RouterModule, InviteFormComponent],
  templateUrl: './invites.component.html',
  styleUrls: ['./invites.component.scss'],
})
export class InvitesComponent implements OnInit, OnDestroy {
  editingInvite: Invite | null = null;
  editingInviteFormData: InviteFormData | null = null;
  isInviteFormOpen: boolean = false;

  onInvite(invite: Invite): void {
    this.editingInvite = invite;
    this.editingInviteFormData = this.convertInviteToFormData(invite);
    this.isInviteFormOpen = true;
    this.toastService.show('Edit or resend invite', 4000, ToastType.INFO);
  }

  closeInviteForm(): void {
    this.isInviteFormOpen = false;
    this.editingInvite = null;
    this.editingInviteFormData = null;
  }

  onInviteFormSubmit(formData: any): void {
    this.toastService.show('Invite updated successfully', 3000, ToastType.SUCCESS);
    this.closeInviteForm();
    this.loadInvites();
  }

  private convertInviteToFormData(invite: Invite): InviteFormData {
    // Extract first and last name from patientName
    const nameParts = invite.patientName ? invite.patientName.split(' ') : ['', ''];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    return {
      id: invite.id.toString(),
      firstName: firstName,
      lastName: lastName,
      gender: 'Male', // Default value, could be stored in invite if needed
      language: 'English', // Default value, could be stored in invite if needed
      group: '', // Could be extracted from invite if stored
      contact: invite.patientEmail || '',
      manualSend: false,
      planLater: !!invite.scheduledDate,
      guests: {
        lovedOne: false,
        colleague: false
      }
    };
  }
  invites: Invite[] = [];
  error: string | null = null;
  isLoading: boolean = false;
  currentPage: number = 1;
  totalPages: number = 1;
  totalInvites: number = 0;
  readonly pageSize = 10;
  readonly Math = Math;

  private destroy$ = new Subject<void>();

  constructor(
    private invitesService: InvitesService,
    private toastService: ToastService,
    private dashboardWebSocketService: DashboardWebSocketService,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadInvites();
    this.setupWebSocketListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupWebSocketListeners(): void {
    // Listen for new invitations
    this.dashboardWebSocketService.patientJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadInvites();
      });

    // Listen for dashboard state changes
    this.dashboardWebSocketService.dashboardState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        if (state.hasNewNotifications) {
          this.loadInvites();
        }
      });
  }

  loadInvites(): void {
    this.isLoading = true;
    this.error = null;

    this.invitesService.getInvites(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          const actualData = response.data?.data || response.data;

          if (actualData && actualData.invites !== undefined) {
            this.invites = actualData.invites || [];
            this.totalInvites = actualData.total || 0;
            this.currentPage = actualData.currentPage || 1;
            this.totalPages = actualData.totalPages || 1;
            } else {
            this.invites = [];
            this.totalInvites = 0;
          }
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.error = 'Failed to load invites';
          this.isLoading = false;
          this.toastService.show('Failed to load invites', 5000, ToastType.ERROR);
        }
      });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.currentPage = page;
      this.loadInvites();
    }
  }

  getPaginationPages(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    const halfVisible = Math.floor(maxVisiblePages / 2);

    let startPage = Math.max(1, this.currentPage - halfVisible);
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  formatDate(date: string | Date): string {
    if (!date) return '';
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) + ' ' + dateObj.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  getStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'pending':
      case 'scheduled':
        return 'status-scheduled';
      case 'accepted':
        return 'status-accepted';
      case 'rejected':
        return 'status-rejected';
      case 'expired':
        return 'status-expired';
      default:
        return 'status-unknown';
    }
  }

  getAcceptanceStatusClass(acceptanceStatus: string): string {
    switch (acceptanceStatus?.toLowerCase()) {
      case 'pending':
      case 'scheduled':
        return 'acceptance-scheduled';
      case 'accepted':
        return 'acceptance-accepted';
      case 'rejected':
        return 'acceptance-rejected';
      case 'expired':
        return 'acceptance-expired';
      default:
        return 'acceptance-unknown';
    }
  }

  getStatusDisplayText(invite: Invite): string {
    // Use statusTag if available, otherwise fall back to acceptanceStatus
    if (invite.statusTag) {
      switch (invite.statusTag.toLowerCase()) {
        case 'scheduled': return 'Scheduled';
        case 'accepted': return 'Accepted';
        case 'rejected': return 'Rejected';
        case 'expired': return 'Expired';
        default: return invite.statusTag;
      }
    }
    return invite.acceptanceStatus || 'Unknown';
  }

  trackInvite(index: number, invite: Invite): number {
    return invite.id;
  }

  trackPage(index: number, page: number): number {
    return page;
  }
}


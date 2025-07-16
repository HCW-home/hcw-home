import { Injectable } from '@angular/core';
import { GuidedTour, Orientation } from 'ngx-guided-tour';
import { GuidedTourService as NgxGuidedTourService } from 'ngx-guided-tour';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class GuidedTourService {
  constructor(
    private ngxGuidedTourService: NgxGuidedTourService,
    private router: Router
  ) {}

  startTour(tour: GuidedTour) {
    this.ngxGuidedTourService.startTour(tour);
  }

  getPractitionerTour(): GuidedTour {
    return {
      tourId: 'practitioner-tour',
      useOrb: false,
      steps: [
        {
          title: 'Welcome to HCW@Home',
          selector: '.home',
          content: 'Welcome to the HCW@Home platform. Let\'s take a quick tour of the main features!',
          orientation: Orientation.Right
        },
        {
          title: 'Dashboard',
          selector: '[data-tour-id="dashboard"]',
          content: 'Your dashboard provides an overview of your activities and key metrics.',
          orientation: Orientation.Right
        },
        {
          title: 'Waiting Room',
          selector: '[data-tour-id="waiting-room"]',
          content: 'Monitor and manage patients waiting for consultations in the virtual waiting room.',
          orientation: Orientation.Right
        },
        {
          title: 'Open Consultations',
          selector: '[data-tour-id="open-consultations"]',
          content: 'Once you have handled a consultation, you can choose to keep it open so your patient can continue communicating with you and sending messages. You can view such consultations in this section.',
          orientation: Orientation.Right
        },
        {
          title: 'Consultation History',
          selector: '[data-tour-id="closed-consultations"]',
          content: 'When you decide to close a consultation, your patient will no longer be able to exchange messages with you. The consultation will remain in this history for 24 hours before being deleted from the system for security reasons.',
          orientation: Orientation.Right
        },
        {
          title: 'Invites',
          selector: '[data-tour-id="invites"]',
          content: 'Manage patient invitations and schedule upcoming consultations.',
          orientation: Orientation.Right
        },
        {
          title: 'Availability Management',
          selector: '[data-tour-id="availability"]',
          content: 'Set and manage your consultation time slots and weekly schedule.',
          orientation: Orientation.Right
        },
        {
          title: 'Profile',
          selector: '.admin-logo-wrapper',
          content: 'Access your profile settings and preferences here.',
          orientation: Orientation.Bottom,
          action: () => {
            this.router.navigate(['/dashboard']).then(() => {
              setTimeout(() => {
                this.startTour(this.getDashboardTour());
              }, 1500);
            });
          }
        },
      ]
    };
  }

  getDashboardTour(): GuidedTour {
    return {
      tourId: 'dashboard-tour',
      useOrb: false,
      steps: [
        {
          title: 'Waiting Room Card',
          selector: 'app-consultation-card:first-child',
          content: 'Monitor patients in the waiting room. Click to view and manage waiting patients.',
          orientation: Orientation.Right
        },
        {
          title: 'Open Consultations Card',
          selector: 'app-consultation-card:nth-child(2)',
          content: 'View your active consultations. Click to join video calls or manage ongoing sessions.',
          orientation: Orientation.Left
        },
        {
          title: 'Send New Invite',
          selector: 'app-button',
          content: 'Click here to create a new consultation invite.',
          orientation: Orientation.Right,
          action: () => {
            setTimeout(() => {
              const inviteButton = document.querySelector('app-consultation-card app-button') as HTMLElement;
              if (inviteButton) {
                inviteButton.click();
                setTimeout(() => {
                  this.startTour(this.getInviteFormTour());
                }, 500);
              }
            }, 2000);
          }
        }
      ]
    };
  }

  getInviteFormTour(): GuidedTour {
    return {
      tourId: 'invite-form-tour',
      useOrb: false,
      steps: [
        {
          title: 'Patient Information',
          selector: '.form-section.left',
          content: 'Enter the patient\'s basic information including name, gender, language and contact details.',
          orientation: Orientation.Left
        },
        {
          title: 'Guest Options',
          selector: '.form-section.right',
          content: 'Choose if you want to invite additional participants like caregivers or colleagues.',
          orientation: Orientation.Right
        },
        {
          title: 'Manual Send Option',
          selector: '.checkbox-row',
          content: 'Choose if you want to send the invitation manually or plan it for later.',
          orientation: Orientation.Bottom
        },
        {
          title: 'Send Invite',
          selector: '.invite-modal__footer app-button:last-child',
          content: 'Click here to send the consultation invitation to the patient.',
          orientation: Orientation.Top,
          action: () => {
            setTimeout(() => {
              this.router.navigate(['/open-consultations']).then(() => {
                setTimeout(() => {
                  this.startTour(this.getOpenConsultationsTour());
                }, 1500);
              });
            }, 2000);
          }
        }
      ]
    };
  }

  getOpenConsultationsTour(): GuidedTour {
    return {
      tourId: 'open-consultations-tour',
      useOrb: false,
      steps: [
        {
          title: 'Active Consultations',
          selector: '.open-consultations-container',
          content: 'Here you can see all your active consultations.',
          orientation: Orientation.Top
        },
        {
          title: 'Consultation Cards',
          selector: 'app-open-consultation-card',
          content: 'Each card represents an active consultation. Click on a card to view more details.',
          orientation: Orientation.Left
        },
        {
          title: 'Consultation Details',
          selector: 'app-open-consultation-panel',
          content: 'View detailed information about the selected consultation here.',
          orientation: Orientation.Right
        },
        {
          title: 'Join Consultation',
          selector: 'button[data-tour="join-consultation"]',
          content: 'Click here to join the video consultation with the patient.',
          orientation: Orientation.Bottom,
          action: () => {
            this.router.navigate(['/closed-consultations']).then(() => {
              setTimeout(() => {
                this.startTour(this.getConsultationHistoryTour());
              }, 2000);
            });
          }
        }
      ]
    };
  }


  getConsultationHistoryTour(): GuidedTour {
    return {
      tourId: 'consultation-history-tour',
      useOrb: false,
      steps: [
        {
          title: 'Consultation History',
          selector: '.consultation-history-container',
          content: 'View and manage all your past consultations here.',
          orientation: Orientation.Top
        },
        {
          title: 'History Cards',
          selector: 'app-consultation-history-card',
          content: 'Each card shows details of a past consultation including patient information and consultation duration.',
          orientation: Orientation.Left
        },
        {
          title: 'Consultation Details',
          selector: '.consultation-detail-panel',
          content: 'Click on any consultation to view detailed information including notes and outcomes.',
          orientation: Orientation.Right,
          action: () => {
            this.router.navigate(['/availability']).then(() => {
              setTimeout(() => {
                this.startTour(this.getAvailabilityTour());
              }, 500);
            });
          }
        }
      ]
    };
  }

  getAvailabilityTour(): GuidedTour {
    return {
      tourId: 'availability-tour',
      useOrb: false,
      steps: [
        {
          title: 'Weekly Availability',
          selector: '.form-card',
          content: 'Set your weekly availability schedule by selecting days and time slots.',
          orientation: Orientation.Left
        },
        {
          title: 'Current Schedule',
          selector: '.availability-table',
          content: 'View and manage your current weekly availability schedule.',
          orientation: Orientation.Left
        },
        {
          title: 'Time Slots',
          selector: '.generate-form',
          content: 'Generate specific time slots for consultations based on your availability.',
          orientation: Orientation.Left
        },
        {
          title: 'Manage Slots',
          selector: '.slots-table',
          content: 'View and manage your generated time slots, including blocking or unblocking specific slots.',
          orientation: Orientation.Right,
          action: () => {
            this.router.navigate(['/profile']).then(() => {
              setTimeout(() => {
                this.startTour(this.getProfileTour());
              }, 500);
            });
          }
        }
      ]
    };
  }

  getProfileTour(): GuidedTour {
    return {
      tourId: 'profile-tour',
      useOrb: false,
      steps: [
        {
          title: 'Personal Information',
          selector: '.profile-form .profile-card:first-child',
          content: 'Update your personal information including name and contact details.',
          orientation: Orientation.Left
        },
        {
          title: 'Professional Information',
          selector: '.profile-form .profile-card:nth-child(2)',
          content: 'Manage your professional details including languages and specialties.',
          orientation: Orientation.Right
        }
      ],
      completeCallback: () => {
        this.router.navigate(['/dashboard']).then(() => {
          setTimeout(() => {
            this.startTour({
              tourId: 'final-help-tour',
              useOrb: false,
              steps: [
                {
                  title: 'Tour Complete!',
                  selector: 'button.help-button',
                  content: 'You\'ve completed the tour! Remember, you can restart this tour anytime by clicking the Help button.',
                  orientation: Orientation.Bottom
                }
              ]
            });
          }, 500);
        });
      }
    };
  }

  getConsultationDetailTour(): GuidedTour {
    return {
      tourId: 'consultation-detail-tour',
      useOrb: false,
      steps: [
        {
          title: 'Consultation Details',
          selector: '.detail-panel',
          content: 'This panel shows all the important information about the current consultation.',
          orientation: Orientation.Left
        },
        {
          title: 'General Information',
          selector: '.detail-section',
          content: 'View patient details and consultation information.',
          orientation: Orientation.Left
        },
        {
          title: 'Timeline',
          selector: '.timeline',
          content: 'Track the consultation timeline and duration.',
          orientation: Orientation.Left
        }
      ]
    };
  }  
}

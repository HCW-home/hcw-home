import { Injectable } from '@angular/core';
import { TourService } from 'ngx-ui-tour-md-menu';
import { IStepOption } from 'ngx-ui-tour-core';
import { Router } from '@angular/router';
import { TourType } from '../models/tour';

export interface IExtendedStepOption extends IStepOption {
  action?: () => void;
}

export interface IExtendedTour {
  tourId?: string;
  useOrb?: boolean;
  steps: IExtendedStepOption[];
  completeCallback?: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class GuidedTourService {
  constructor(
    private tourService: TourService,
    private router: Router
  ) {
    this.tourService.stepShow$.subscribe(({ step }) => {
      const s = step as IExtendedStepOption;
      if (s?.action) {
        setTimeout(() => s.action!(), 3000); 
      }
    });
  }

  startTour(steps: IExtendedStepOption[] | IExtendedTour) {
    if (Array.isArray(steps)) {
      this.tourService.initialize(steps);
      this.tourService.start();
    } else {
      this.tourService.initialize(steps.steps);
      if (steps.completeCallback) {
        this.tourService.end$.subscribe(() => {
          steps.completeCallback!();
        });
      }
      this.tourService.start();
    }
  }

  startMainTour() {
    this.startTour(this.getPractitionerTour());
  }

  getPractitionerTour(): IExtendedStepOption[] {
    return [
      {
        title: 'Welcome to HCW@Home',
        anchorId: TourType.HOME,
        content: `Welcome to the HCW@Home platform helps you connect with patients. This tour will help you understand the concept. You can skip the tour at any time by closing this help.`,
      },
      {
        title: 'Dashboard',
        anchorId: TourType.DASHBOARD,
        content: 'Your dashboard provides an overview of your activities and key metrics.',
      },
      {
        title: 'Send New Invite',
        anchorId: TourType.DASHBOARD_INVITE_BUTTON,
        content: 'Click here to open the form. Invites allow patients to join you on this application. Create or revoke invites at any time from this area.',
        action: () => {
          this.tourService.end();
          setTimeout(() => {
            (document.querySelector('app-consultation-card app-button') as HTMLElement)?.click();
            setTimeout(() => {
              this.startTour(this.getInviteFormTour());
            }, 1000);
          }, 500);
        }
      }
    ];
  }

  getInviteFormTour(): IExtendedStepOption[] {
    return [
      {
        title: 'Patient Information',
        anchorId: TourType.INVITE_FORM_PATIENT_INFO,
        content: `Fill in the patient\'s information to easily recognize which patient is waiting for a remote consultation. You can send the invite link via SMS, email, or WhatsApp, depending on the software configuration and the patient\'s country.`,
      },
      {
        title: 'Guest Options',
        anchorId: TourType.INVITE_FORM_GUEST_OPTIONS,
        content: `Invite caregivers or additional participants.`,
      },
      {
        title: 'Manual Send Option',
        anchorId: TourType.INVITE_FORM_MANUAL_SEND,
        content: `If you prefer to share the link with your patient manually, check this box. After sending, you will be able to copy the link and share it (e.g., in an email you write yourself). Be careful not to use the link yourself to test it, as the link is usable only once.`,
      },
      {
        title: 'Send Invite',
        anchorId: TourType.INVITE_FORM_SUBMIT,
        content: `Click here to send the consultation invitation.`,
        action: () => {
          this.tourService.end();
          setTimeout(() => {
            this.router.navigate(['/open-consultations']).then(() => {
              setTimeout(() => {
                this.startTour(this.getOpenConsultationsTour());
              }, 1000);
            });
          }, 500);
        }
      }
    ];
  }

  getOpenConsultationsTour(): IExtendedStepOption[] {
    return [
      {
        title: 'Active Consultations',
        anchorId: TourType.OPENED_CONSULTATIONS_MENU,
        content: 'Once your patient has used the link and requested to join the consultation, you will be notified with a sound and see the incoming patient in this queue. Keep the application open to reduce the risk of missing a consultation.',
        action: () => {
          this.tourService.end();
          setTimeout(() => {
            this.router.navigate(['/closed-consultations']).then(() => {
              setTimeout(() => {
                this.startTour(this.getConsultationHistoryTour());
              }, 1000);
            });
          }, 500);
        }
      },
    ];
  }

  getConsultationHistoryTour(): IExtendedStepOption[] {
    return [
      {
        title: 'Consultation History',
        anchorId: TourType.CLOSED_CONSULTATIONS,
        content: 'When you decide to close a consultation, your patient will no longer be able to exchange messages with you. The consultation will remain in this history for 24 hours before being deleted from the system for security reasons.',
        action: () => {
          this.tourService.end();
          setTimeout(() => {
            this.router.navigate(['/availability']).then(() => {
              setTimeout(() => {
                this.startTour(this.getAvailabilityTour());
              }, 1000);
            });
          }, 500);
        }
      },
    ];
  }

  getAvailabilityTour(): IExtendedStepOption[] {
    return [
      {
        title: 'Weekly Availability',
        anchorId: TourType.AVAILABILITY_FORM_CARD,
        content: 'Set your weekly availability here.',
      },
      {
        title: 'Time Slots',
        anchorId: TourType.AVAILABILITY_FORM,
        content: 'Generate slots based on your availability.',
         action: () => {
          this.tourService.end();
          setTimeout(() => {
            this.router.navigate(['/profile']).then(() => {
              setTimeout(() => {
                this.startTour(this.getProfileTour());
              }, 1000);
            });
          }, 500);
        }
      },
    ];
  }

  getProfileTour(): IExtendedStepOption[] {
    return [
      {
        title: 'Access to your profile',
        anchorId: TourType.HEADER_PROFILE_MENU,
        content: 'You can manage some information from your profile page.',
      },
      {
        title: 'Personal Information',
        anchorId: TourType.PROFILE_PERSONAL_INFO,
        content: 'You can change the language or enable SMS notifications in case something happens when you are not connected to this application.',
      },
      {
        title: 'Professional Information',
        anchorId: TourType.PROFILE_PROFESSIONAL_INFO,
        content: 'You can change the language or enable SMS notifications in case something happens when you are not connected to this application.',
         action: () => {
          this.tourService.end();
          setTimeout(() => {
            this.router.navigate(['/dashboard']).then(() => {
              setTimeout(() => {
                this.startTour(this.getEndTour());
              }, 1000);
            });
          }, 500);
        }
      },
    ];
  }

  getEndTour(): IExtendedStepOption[] {
    return [
      {
        title: 'Tour Complete!',
        anchorId: TourType.HELP_BUTTON,
        content: `You've completed the tour! You can restart it anytime via Help.`,
      },
    ];
  }
}


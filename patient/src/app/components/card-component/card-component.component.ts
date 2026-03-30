import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonList, IonItem, IonLabel, IonButton, IonIcon,
  IonChip, IonText, ToastController, LoadingController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  videocamOutline, starOutline,
  calendarOutline,
  checkmarkCircle,
  informationCircleOutline
} from 'ionicons/icons';

import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
import { Consultation } from 'src/app/services/consultation.service';
import { JoinConsultationService, JoinError } from 'src/app/services/joinConsultation.service';
import { RoutePaths } from 'src/app/constants/route-path.enum';
@Component({
  selector: 'card-component',
  templateUrl: './card-component.component.html',
  styleUrls: ['./card-component.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonChip,
    IonText
  ]
})

export class CardComponentComponent {
  private toastController = inject(ToastController);
  private loadingController = inject(LoadingController);
  private router = inject(Router);
  private joinConsultationService = inject(JoinConsultationService);
  private authService = inject(AuthService);

  constructor() {
    addIcons({
      videocamOutline,
      starOutline,
      calendarOutline,
      checkmarkCircle,
      informationCircleOutline
    });
  }
  @Input() activeConsultations: Consultation[] = [];
  @Input() completedConsultations: Consultation[] = [];
  @Input() upcomingConsultations: Consultation[] = [];

  /**
   * Enhanced join consultation with comprehensive error handling and state management
   */
  async joinConsultation(consultationId: number) {
    const user = this.authService.getCurrentUser();
    const userId = user?.id;

    if (!userId) {
      await this.presentErrorToast('Please log in to join consultation.');
      return;
    }

    // Check if already joining to prevent duplicate requests
    if (this.joinConsultationService.isCurrentlyJoining()) {
      await this.presentInfoToast('Already joining consultation, please wait...');
      return;
    }

    let loading: any = null;

    try {
      loading = await this.loadingController.create({
        message: 'Joining consultation...',
        spinner: 'crescent',
        duration: 30000 // Maximum 30 seconds
      });
      await loading.present();

      console.log(`[CardComponent] Attempting to join consultation ${consultationId} for user ${userId}`);

      // Use the new production-grade service method
      const response = await this.joinConsultationService.smartPatientJoin(
        consultationId,
        userId,
        {
          clientInfo: {
            source: 'patient_dashboard',
            userAgent: navigator.userAgent,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            }
          },
          requestTimeout: 25000, // Slightly less than loading timeout
          maxRetries: 2
        }
      );

      await this.handleJoinSuccess(response, consultationId);

    } catch (error) {
      console.error(`[CardComponent] Failed to join consultation ${consultationId}:`, error);
      await this.handleJoinError(error as JoinError, consultationId);
    } finally {
      if (loading) {
        await loading.dismiss();
      }
    }
  }

  /**
   * Handle successful consultation join with smart navigation
   */
  private async handleJoinSuccess(response: any, consultationId: number) {
    console.log(`[CardComponent] Join successful for consultation ${consultationId}:`, response);

    let navigationRoute: string;
    let message: string;

    if (response.redirectTo === 'waiting-room') {
      navigationRoute = `/${RoutePaths.WaitingRoom.replace(':consultationId', consultationId.toString())}`;
      message = 'You are in the waiting room. Please wait for the practitioner.';

      if (response.waitingRoom?.estimatedWaitTime) {
        message += ` Estimated wait time: ${response.waitingRoom.estimatedWaitTime}.`;
      }
    } else if (response.redirectTo === 'consultation-room') {
      navigationRoute = `/${RoutePaths.ConsultationRoom.replace(':consultationId', consultationId.toString())}`;
      message = 'Joining consultation room...';
    } else if (response.sessionUrl) {
      navigationRoute = response.sessionUrl;
      message = 'Redirecting to consultation...';
    } else {
      navigationRoute = `/${RoutePaths.WaitingRoom.replace(':consultationId', consultationId.toString())}`;
      message = 'Joining consultation...';
    }

    try {
      await this.router.navigate([navigationRoute]);
      await this.presentSuccessToast(message);
    } catch (navError) {
      console.error('[CardComponent] Navigation error:', navError);
      await this.presentErrorToast('Joined successfully but navigation failed. Please refresh the page.');
    }
  }

  /**
   * Handle join errors with smart recovery actions
   */
  private async handleJoinError(error: JoinError, consultationId: number) {
    let errorMessage: string;
    let action: 'retry' | 'login' | 'contact-support' | 'none' = 'none';

    if (error && typeof error === 'object') {
      if (error.code) {
        switch (error.code) {
          case 'UNAUTHORIZED':
          case 'FORBIDDEN':
            errorMessage = 'Please log in again to join this consultation.';
            action = 'login';
            break;
          case 'CONSULTATION_NOT_FOUND':
            errorMessage = 'Consultation not found. Please check the consultation details.';
            break;
          case 'CONSULTATION_CONFLICT':
            errorMessage = 'Unable to join. The consultation may have ended or you may already be connected.';
            break;
          case 'RATE_LIMITED':
            errorMessage = 'Too many requests. Please wait a moment and try again.';
            action = 'retry';
            break;
          case 'TIMEOUT':
          case 'NETWORK_ERROR':
            errorMessage = 'Connection timeout. Please check your internet connection and try again.';
            action = 'retry';
            break;
          case 'SERVER_ERROR':
          case 'SERVICE_UNAVAILABLE':
            errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
            action = 'retry';
            break;
          default:
            errorMessage = error.message || 'Failed to join consultation. Please try again.';
            if (error.recoverable) {
              action = 'retry';
            }
        }
      } else {
        errorMessage = error.message || 'An unexpected error occurred.';
      }
    } else {
      errorMessage = 'Failed to join consultation. Please try again.';
      action = 'retry';
    }

    await this.presentErrorToast(errorMessage);

    if (action === 'login') {
      setTimeout(() => {
        this.router.navigate([`/${RoutePaths.Login}`], {
          queryParams: { returnUrl: `/consultation/${consultationId}` }
        });
      }, 2000);
    } else if (action === 'retry' && error.retryAfter) {
      await this.presentInfoToast(`You can retry in ${Math.ceil(error.retryAfter / 1000)} seconds.`);
    }
  }

  // we have to provide it after consultation ends

  navigateToFeedback(consultationId: number) {
    this.router.navigate([`/${RoutePaths.PostConsultationFeedback}`], {
      queryParams: { consultationId }
    });
  }

  /**
   * Present success toast message
   */
  async presentSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'success',
      position: 'top',
      icon: 'checkmark-circle'
    });
    await toast.present();
  }

  /**
   * Present error toast message
   */
  async presentErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 4000,
      color: 'danger',
      position: 'top',
      icon: 'alert-circle'
    });
    await toast.present();
  }

  /**
   * Present info toast message
   */
  async presentInfoToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'primary',
      position: 'top',
      icon: 'information-circle'
    });
    await toast.present();
  }

  /**
   * Present general toast message (legacy method)
   */
  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      color: 'success',
      position: 'top'
    });
    await toast.present();
  }
}

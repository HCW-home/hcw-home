import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import {
 IonContent, IonHeader, IonTitle, IonToolbar, IonCard,
 IonCardHeader, IonCardTitle, IonCardContent, IonButton,
 IonSpinner, IonText, IonIcon, IonGrid, IonRow, IonCol,
 IonItem, IonCheckbox, IonLabel,
 LoadingController, ToastController, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
 medicalOutline, linkOutline, checkmarkCircleOutline, alertCircleOutline,
 refreshOutline, personOutline, homeOutline, documentTextOutline, closeOutline
} from 'ionicons/icons';

import { AuthService } from 'src/app/services/auth.service';
import { JoinConsultationService, JoinConsultationResponseDto } from 'src/app/services/joinConsultation.service';
import { RoutePaths } from 'src/app/constants/route-path.enum';
import { TermService } from 'src/app/services/term.service';
import { Term } from 'src/app/models/user.model';

type JoinMethod = 'token' | 'direct' | 'magic-link' | 'form';
type JoinStep = 'loading' | 'terms' | 'joining' | 'error' | 'success';

@Component({
 selector: 'app-join-consultation',
 templateUrl: './join-consultation.page.html',
 styleUrls: ['./join-consultation.page.scss'],
 standalone: true,
 imports: [
  CommonModule, ReactiveFormsModule,
  IonContent, IonHeader, IonTitle, IonToolbar, IonCard,
  IonCardHeader, IonCardTitle, IonCardContent, IonButton,
  IonSpinner, IonText, IonIcon, IonGrid, IonRow, IonCol,
  IonItem, IonCheckbox, IonLabel
 ]
})
export class JoinConsultationPage implements OnInit {
 // Route parameters
 token: string = '';
 consultationId: string = '';
 practitionerId: string = '';
 patientId: string = '';

 // Component state
 isLoading: boolean = false;
 errorMessage: string = '';
 currentStep: JoinStep = 'loading';
 joinMethod: JoinMethod = 'direct';

 // Terms and form
 termsForm: FormGroup;
 terms: Term | null = null;
 showTerms: boolean = false;

 constructor(
  private route: ActivatedRoute,
  private router: Router,
  private authService: AuthService,
  private joinConsultationService: JoinConsultationService,
  private termService: TermService,
  private formBuilder: FormBuilder,
  private loadingController: LoadingController,
  private toastController: ToastController,
  private alertController: AlertController
 ) {
  // Initialize icons
  addIcons({
   medicalOutline, linkOutline, checkmarkCircleOutline, alertCircleOutline,
   refreshOutline, personOutline, homeOutline, documentTextOutline, closeOutline
  });

  // Initialize form
  this.termsForm = this.formBuilder.group({
   acceptTerms: [false, Validators.requiredTrue]
  });
 }

 async ngOnInit(): Promise<void> {
  console.log('[JoinConsultation] Component initialized');

  try {
   await this.parseRouteParameters();
   await this.initializeJoinProcess();
  } catch (error) {
   console.error('[JoinConsultation] Initialization error:', error);
   this.handleError('Failed to initialize consultation join process');
  }
 }

 /**
  * Parse route parameters and determine join method
  */
 private async parseRouteParameters(): Promise<void> {
  const params = this.route.snapshot.params;
  const queryParams = this.route.snapshot.queryParams;
  const fragment = this.route.snapshot.fragment;

  console.log('[JoinConsultation] Route params:', params);
  console.log('[JoinConsultation] Query params:', queryParams);
  console.log('[JoinConsultation] Fragment:', fragment);

  // Extract parameters
  this.token = params['token'] || queryParams['token'] || '';
  this.consultationId = params['id'] || queryParams['consultationId'] || '';
  this.practitionerId = queryParams['practitionerId'] || '';
  this.patientId = queryParams['patientId'] || '';

  // Determine join method
  if (this.token) {
   if (this.token.startsWith('magic_')) {
    this.joinMethod = 'magic-link';
    console.log('[JoinConsultation] Magic link join detected');
   } else {
    this.joinMethod = 'token';
    console.log('[JoinConsultation] Token-based join detected');
   }
  } else if (this.consultationId) {
   this.joinMethod = 'direct';
   console.log('[JoinConsultation] Direct consultation join detected');
  } else {
   this.joinMethod = 'form';
   console.log('[JoinConsultation] Form-based join - will require terms acceptance');
  }

  console.log(`[JoinConsultation] Join method determined: ${this.joinMethod}`);
 }

 /**
  * Initialize the join process based on the method
  */
 private async initializeJoinProcess(): Promise<void> {
  this.currentStep = 'loading';
  this.isLoading = true;

  try {
   // Check authentication first
   const user = this.authService.getCurrentUser();
   if (!user) {
    console.log('[JoinConsultation] User not authenticated, redirecting to login');
    await this.handleAuthRequired();
    return;
   }

   switch (this.joinMethod) {
    case 'token':
    case 'magic-link':
     // For token-based joins, proceed directly
     await this.processJoinRequest();
     break;

    case 'direct':
     // For direct joins, check if terms acceptance is required
     if (await this.areTermsRequired()) {
      await this.showTermsAcceptance();
     } else {
      await this.processJoinRequest();
     }
     break;

    case 'form':
     // Always require terms for form-based joins
     await this.showTermsAcceptance();
     break;

    default:
     throw new Error(`Unknown join method: ${this.joinMethod}`);
   }
  } catch (error) {
   console.error('[JoinConsultation] Join process error:', error);
   this.handleError(error);
  }
 }

 /**
  * Check if terms acceptance is required
  */
 private async areTermsRequired(): Promise<boolean> {
  try {
   return !this.token && this.joinMethod === 'direct';
  } catch (error) {
   console.error('[JoinConsultation] Error checking terms requirement:', error);
   return true; // Default to requiring terms on error
  }
 }

 /**
  * Show terms acceptance form for direct joins
  */
 private async showTermsAcceptance(): Promise<void> {
  this.currentStep = 'terms';
  this.isLoading = false;
  this.showTerms = true;

  try {
   // Load terms content using the correct method name
   this.terms = this.termService.getLatestTrem();
   if (!this.terms) {
    // Try to fetch latest terms if not cached
    this.termService.getLatestTermAndStore().subscribe(term => {
     this.terms = term || null;
    });
   }
   console.log(`[JoinConsultation] Terms loaded:`, this.terms);
  } catch (error) {
   console.error('[JoinConsultation] Error loading terms:', error);
   // Continue without terms content, but still show acceptance checkbox
   this.terms = null;
  }
 }

 /**
  * Handle manual join after terms acceptance
  */
 async joinWithTermsAccepted(): Promise<void> {
  if (!this.termsForm.valid) {
   await this.showToast('Please accept the terms and conditions to continue.', 'warning');
   return;
  }

  this.currentStep = 'joining';
  this.showTerms = false;
  this.isLoading = true;

  try {
   console.log(`[JoinConsultation] Joining consultation ${this.consultationId} with terms accepted`);

   // Use the correct method name from the service
   const response = await this.joinConsultationService.smartPatientJoin(
    parseInt(this.consultationId),
    parseInt(this.patientId || String(this.authService.getCurrentUser()?.id) || '0'),
    {
     clientInfo: {
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      joinSource: 'patient-portal',
      termsAccepted: true
     }
    }
   );

   await this.handleSuccessfulJoin(response);
  } catch (error) {
   console.error('[JoinConsultation] Join error:', error);
   this.handleError(error);
  }
 }

 /**
  * Process the join request based on method
  */
 private async processJoinRequest(): Promise<void> {
  this.isLoading = true;
  this.errorMessage = '';
  this.currentStep = 'joining';

  const loading = await this.loadingController.create({
   message: 'Joining consultation...',
  });
  await loading.present();

  try {
   console.log(`[JoinConsultation] Processing join request via ${this.joinMethod}`);

   const user = this.authService.getCurrentUser();
   let response: JoinConsultationResponseDto;

   switch (this.joinMethod) {
    case 'magic-link':
    case 'token':
     response = await this.joinConsultationService.joinByToken(
      this.token,
      {
       userId: user?.id,
       clientInfo: {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        joinSource: 'patient-portal'
       }
      }
     );
     break;

    case 'direct':
     response = await this.joinConsultationService.smartPatientJoin(
      parseInt(this.consultationId),
      parseInt(this.patientId || String(user?.id) || '0'),
      {
       clientInfo: {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        joinSource: 'patient-portal'
       }
      }
     );
     break;

    default:
     throw new Error(`Invalid join method: ${this.joinMethod}`);
   }

   await loading.dismiss();
   await this.handleSuccessfulJoin(response);

  } catch (error: any) {
   await loading.dismiss();
   console.error('[JoinConsultation] Processing error:', error);
   this.handleError(error);
  } finally {
   this.isLoading = false;
  }
 }

 /**
  * Handle successful join response
  */
 private async handleSuccessfulJoin(response: JoinConsultationResponseDto): Promise<void> {
  console.log('[JoinConsultation] Join successful:', response);

  if (!response?.consultationId) {
   throw new Error('Invalid response: missing consultation ID');
  }

  const consultationId = response.consultationId;
  const redirectTo = response.redirectTo;

  this.currentStep = 'success';
  let message = 'Successfully joined consultation!';

  if (response.waitingRoom) {
   message = 'You have been placed in the waiting room. The practitioner will join you shortly.';
  }

  await this.showToast(message, 'success');

  // Small delay to show success state
  setTimeout(async () => {
   if (redirectTo === 'waiting-room') {
    console.log(`[JoinConsultation] Navigating to waiting room for consultation: ${consultationId}`);
    await this.router.navigate([RoutePaths.WaitingRoom], {
     queryParams: { consultationId, source: 'join-consultation' }
    });
   } else if (redirectTo === 'consultation-room') {
    console.log(`[JoinConsultation] Navigating to consultation room: ${consultationId}`);
    await this.router.navigate([RoutePaths.ConsultationRoom], {
     queryParams: { consultationId, source: 'join-consultation' }
    });
   } else {
    // Default navigation based on response
    if (response.waitingRoom) {
     await this.router.navigate([RoutePaths.WaitingRoom], {
      queryParams: { consultationId, source: 'join-consultation' }
     });
    } else {
     await this.router.navigate([RoutePaths.ConsultationRoom], {
      queryParams: { consultationId, source: 'join-consultation' }
     });
    }
   }
  }, 1500);
 }

 /**
  * Handle authentication required
  */
 private async handleAuthRequired(): Promise<void> {
  console.log('[JoinConsultation] Authentication required');

  // Prepare redirect URL with current parameters
  const currentUrl = this.router.url;
  const redirectUrl = encodeURIComponent(currentUrl);

  const alert = await this.alertController.create({
   header: 'Login Required',
   message: 'Please log in to join the consultation.',
   buttons: [
    {
     text: 'Cancel',
     role: 'cancel',
     handler: () => {
      this.router.navigate([RoutePaths.Dashboard]);
     }
    },
    {
     text: 'Login',
     handler: () => {
      this.goToLogin();
     }
    }
   ]
  });

  await alert.present();
 }

 /**
  * Handle errors during join process
  */
 private handleError(error: any): void {
  this.isLoading = false;
  this.currentStep = 'error';

  let errorMessage = 'An unexpected error occurred. Please try again.';

  if (typeof error === 'string') {
   errorMessage = error;
  } else if (error?.message) {
   errorMessage = error.message;
  } else if (error?.error?.message) {
   errorMessage = error.error.message;
  }

  // Check for authentication errors
  if (errorMessage.toLowerCase().includes('unauthorized') ||
   errorMessage.toLowerCase().includes('login') ||
   errorMessage.toLowerCase().includes('auth')) {
   this.handleAuthRequired();
   return;
  }

  this.errorMessage = errorMessage;
  console.error('[JoinConsultation] Error handled:', errorMessage);
 }

 /**
  * Retry the join process
  */
 async retryJoin(): Promise<void> {
  console.log('[JoinConsultation] Retrying join process');
  this.errorMessage = '';
  this.currentStep = 'loading';
  await this.initializeJoinProcess();
 }

 /**
  * Navigate to login with redirect
  */
 async goToLogin(): Promise<void> {
  const currentUrl = this.router.url;
  const redirectUrl = encodeURIComponent(currentUrl);

  await this.router.navigate([RoutePaths.Login], {
   queryParams: { redirect: redirectUrl }
  });
 }

 /**
  * Navigate to dashboard
  */
 async goToDashboard(): Promise<void> {
  await this.router.navigate([RoutePaths.Dashboard]);
 }

 /**
  * Show toast message
  */
 private async showToast(message: string, color: string = 'success'): Promise<void> {
  const toast = await this.toastController.create({
   message,
   duration: 3000,
   color,
   position: 'top',
  });
  await toast.present();
 }

 // Getters for template
 get isLoadingStep(): boolean {
  return this.currentStep === 'loading' || this.isLoading;
 }

 get isTermsStep(): boolean {
  return this.currentStep === 'terms' && this.showTerms;
 }

 get isErrorStep(): boolean {
  return this.currentStep === 'error' && !!this.errorMessage;
 }

 get isSuccessStep(): boolean {
  return this.currentStep === 'success';
 }

 get isJoiningStep(): boolean {
  return this.currentStep === 'joining' && this.isLoading;
 }
}

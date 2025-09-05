import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
 IonContent, IonHeader, IonTitle, IonToolbar, IonCard,
 IonCardHeader, IonCardTitle, IonCardContent, IonButton,
 IonSpinner, IonText, IonIcon, IonItem, IonLabel,
 LoadingController, ToastController, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
 timeOutline, personOutline, medicalOutline,
 exitOutline, refreshOutline, checkmarkCircleOutline
} from 'ionicons/icons';
import { Subscription, interval } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { AuthService } from 'src/app/services/auth.service';
import { JoinConsultationService } from 'src/app/services/joinConsultation.service';
import { RoutePaths } from 'src/app/constants/route-path.enum';
import { environment } from 'src/environments/environment';

@Component({
 selector: 'app-waiting-room',
 templateUrl: './waiting-room.page.html',
 styleUrls: ['./waiting-room.page.scss'],
 standalone: true,
 imports: [
  CommonModule,
  IonContent, IonHeader, IonTitle, IonToolbar, IonCard,
  IonCardHeader, IonCardTitle, IonCardContent, IonButton,
  IonSpinner, IonText, IonIcon, IonItem, IonLabel
 ],
})
export class WaitingRoomPage implements OnInit, OnDestroy {
 consultationId: number = 0;
 patientId: number = 0;
 isLoading = false;
 isConnected = false;

 waitingTime = '0:00';
 estimatedWaitTime = '2-5 minutes';
 practitionerName = '';
 queuePosition = 1;

 // WebSocket and monitoring
 private socket: Socket | null = null;
 private subscriptions: Subscription[] = [];
 private startTime = new Date();
 private waitingTimeSubscription?: Subscription;

 constructor(
  private route: ActivatedRoute,
  private router: Router,
  private authService: AuthService,
  private joinConsultationService: JoinConsultationService,
  private loadingController: LoadingController,
  private toastController: ToastController,
  private alertController: AlertController
 ) {
  addIcons({
   timeOutline, personOutline, medicalOutline,
   exitOutline, refreshOutline, checkmarkCircleOutline
  });
 }

 ngOnInit() {
  console.log('[WaitingRoom] Initializing waiting room page');

  // Get consultation ID from route
  const consultationIdParam = this.route.snapshot.paramMap.get('consultationId');
  if (!consultationIdParam || isNaN(parseInt(consultationIdParam))) {
   this.showToast('Invalid consultation ID', 'danger');
   this.router.navigate([`/${RoutePaths.PatientDashboard}`]);
   return;
  }

  this.consultationId = parseInt(consultationIdParam);

  // Get patient ID from auth
  const user = this.authService.getCurrentUser();
  if (!user?.id) {
   this.showToast('Please log in to continue', 'warning');
   this.router.navigate([`/${RoutePaths.Login}`]);
   return;
  }

  this.patientId = user.id;

  // Initialize waiting room
  this.initializeWaitingRoom();
 }

 ngOnDestroy() {
  console.log('[WaitingRoom] Cleaning up waiting room');
  this.cleanup();
 }

 /**
  * Initialize waiting room with backend integration
  */
 private async initializeWaitingRoom(): Promise<void> {
  this.isLoading = true;

  try {
   console.log(`[WaitingRoom] Joining consultation ${this.consultationId} as patient ${this.patientId}`);

   // Join consultation using smart join logic
   const joinResponse = await this.joinConsultationService.smartPatientJoin(
    this.consultationId,
    this.patientId,
    { clientInfo: { source: 'waiting-room' } }
   );

   if (joinResponse.redirectTo === 'consultation-room') {
    console.log('[WaitingRoom] Patient should be in consultation room, redirecting');
    this.router.navigate(['/consultation-room', this.consultationId]);
    return;
   }

   // Extract waiting room data
   if (joinResponse.waitingRoom) {
    this.practitionerName = joinResponse.waitingRoom.practitionerName || 'Doctor';
    this.estimatedWaitTime = joinResponse.waitingRoom.estimatedWaitTime || '2-5 minutes';
   }

   // Start real-time monitoring
   this.setupWebSocketConnection();
   this.startWaitingTimeCounter();

   console.log('[WaitingRoom] Successfully initialized waiting room');

  } catch (error) {
   console.error('[WaitingRoom] Error initializing waiting room:', error);
   this.showToast('Error loading waiting room. Please try again.', 'danger');
  } finally {
   this.isLoading = false;
  }
 }

 /**
 * Setup WebSocket connection for real-time updates
 */
 private setupWebSocketConnection(): void {
  try {
   const token = this.authService.getToken();
   const wsUrl = environment.socketUrl || environment.apiUrl.replace('/api', '').replace('3000', '3001');

   this.socket = io(`${wsUrl}/consultation`, {
    auth: { token },
    query: {
     consultationId: this.consultationId.toString(),
     userId: this.patientId.toString(),
     role: 'PATIENT'
    },
    transports: ['websocket']
   });

   this.socket.on('connect', () => {
    console.log('[WaitingRoom] WebSocket connected');
    this.isConnected = true;
   });

   this.socket.on('disconnect', () => {
    console.log('[WaitingRoom] WebSocket disconnected');
    this.isConnected = false;
   });

   // Listen for admission to consultation room
   this.socket.on('patient_admitted', (data: any) => {
    if (data.patient?.id === this.patientId || data.patientId === this.patientId) {
     console.log('[WaitingRoom] Patient admitted, redirecting to consultation room');
     this.showToast('You have been admitted to the consultation!', 'success');
     this.router.navigate(['/consultation-room', this.consultationId]);
    }
   });

   // Listen for navigation commands
   this.socket.on('navigate_to_consultation_room', (data: any) => {
    console.log('[WaitingRoom] Navigate to consultation room event');
    this.showToast('Joining consultation now!', 'success');
    this.router.navigate(['/consultation-room', this.consultationId]);
   });

   // Listen for session status updates
   this.socket.on('session_status_response', (data: any) => {
    if (data.success && data.data?.navigation?.currentLocation === 'consultation-room') {
     this.router.navigate(['/consultation-room', this.consultationId]);
    }
   });

   // Listen for consultation status changes
   this.socket.on('consultation_status', (data: any) => {
    if (data.status === 'COMPLETED' || data.status === 'TERMINATED_OPEN') {
     this.showToast('Consultation has ended', 'primary');
     this.router.navigate([`/${RoutePaths.PatientDashboard}`]);
    }
   });

   this.socket.on('error', (error: any) => {
    console.error('[WaitingRoom] WebSocket error:', error);
    this.showToast('Connection error. Please refresh the page.', 'danger');
   });

  } catch (error) {
   console.error('[WaitingRoom] Error setting up WebSocket:', error);
  }
 }

 /**
  * Start waiting time counter
  */
 private startWaitingTimeCounter(): void {
  const subscription = interval(1000).subscribe(() => {
   const now = new Date();
   const diffMs = now.getTime() - this.startTime.getTime();
   const minutes = Math.floor(diffMs / 60000);
   const seconds = Math.floor((diffMs % 60000) / 1000);
   this.waitingTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  this.subscriptions.push(subscription);
 }

 /**
  * Check current session status
  */
 async checkStatus(): Promise<void> {
  const loading = await this.loadingController.create({
   message: 'Checking status...',
   duration: 2000
  });
  await loading.present();

  try {
   if (this.socket?.connected) {
    this.socket.emit('check_session_status', {
     consultationId: this.consultationId,
     patientId: this.patientId
    });
   } else {
    // Fallback API call
    const response = await this.joinConsultationService.checkSessionStatus(this.consultationId);
    if (response?.redirectTo === 'consultation-room') {
     this.router.navigate(['/consultation-room', this.consultationId]);
    }
   }
  } catch (error) {
   console.error('[WaitingRoom] Error checking status:', error);
   this.showToast('Error checking status', 'danger');
  }
 }

 /**
  * Refresh WebSocket connection
  */
 async refreshConnection(): Promise<void> {
  const loading = await this.loadingController.create({
   message: 'Refreshing connection...',
   duration: 1000
  });
  await loading.present();

  try {
   if (this.socket) {
    this.socket.disconnect();
    this.socket = null;
   }

   setTimeout(() => {
    this.setupWebSocketConnection();
    this.showToast('Connection refreshed', 'success');
   }, 1000);
  } catch (error) {
   console.error('[WaitingRoom] Error refreshing connection:', error);
   this.showToast('Error refreshing connection', 'danger');
  }
 }

 /**
  * Leave waiting room
  */
 async leaveWaitingRoom(): Promise<void> {
  const alert = await this.alertController.create({
   header: 'Leave Waiting Room',
   message: 'Are you sure you want to leave? You will need to rejoin the consultation.',
   buttons: [
    {
     text: 'Cancel',
     role: 'cancel'
    },
    {
     text: 'Leave',
     handler: () => {
      this.router.navigate([`/${RoutePaths.PatientDashboard}`]);
     }
    }
   ]
  });

  await alert.present();
 }

 /**
  * Cleanup resources
  */
 private cleanup(): void {
  // Disconnect WebSocket
  if (this.socket) {
   this.socket.disconnect();
   this.socket = null;
  }

  // Unsubscribe from all subscriptions
  this.subscriptions.forEach(sub => sub.unsubscribe());
  this.subscriptions = [];
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
  toast.present();
 }
}

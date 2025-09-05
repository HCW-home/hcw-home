import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
 IonContent, IonHeader, IonTitle, IonToolbar, IonCard,
 IonCardHeader, IonCardTitle, IonCardContent, IonButton,
 IonIcon, IonText, IonFab, IonFabButton, IonGrid, IonRow, IonCol,
 IonList, IonItem, IonLabel, IonBadge, IonToast,
 LoadingController, ToastController, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
 videocamOutline, videocamOffOutline, micOutline, micOffOutline,
 chatbubbleOutline, callOutline, exitOutline, personOutline,
 medicalOutline, alertCircleOutline, checkmarkCircleOutline
} from 'ionicons/icons';

import { AuthService } from 'src/app/services/auth.service';
import { JoinConsultationService } from 'src/app/services/joinConsultation.service';
import {
 ConsultationRoomService,
 ConsultationRoomState,
 MediaSessionState,
 ChatMessage,
 ConsultationParticipant
} from 'src/app/services/consultation-room.service';
import { RoutePaths } from 'src/app/constants/route-path.enum';

@Component({
 selector: 'app-consultation-room',
 templateUrl: './consultation-room.page.html',
 styleUrls: ['./consultation-room.page.scss'],
 standalone: true,
 imports: [
  CommonModule,
  IonContent, IonHeader, IonTitle, IonToolbar, IonCard,
  IonCardHeader, IonCardTitle, IonCardContent, IonButton,
  IonIcon, IonText, IonFab, IonFabButton, IonGrid, IonRow, IonCol,
  IonList, IonItem, IonLabel, IonBadge, IonToast
 ],
})
export class ConsultationRoomPage implements OnInit, OnDestroy {
 consultationId: number = 0;
 patientId: number = 0;
 isLoading = false;

 consultationState: ConsultationRoomState = {
  consultationId: 0,
  isConnected: false,
  practitionerPresent: false,
  practitionerName: '',
  sessionStatus: 'connecting',
  participantCount: 0,
  mediaStatus: {
   videoEnabled: false,
   audioEnabled: false,
   screenShareEnabled: false
  }
 };

 mediaSessionState: MediaSessionState = {
  routerId: '',
  rtpCapabilities: null,
  canJoinMedia: false,
  mediaInitialized: false,
  connectionQuality: 'disconnected'
 };

 chatMessages: ChatMessage[] = [];
 participants: ConsultationParticipant[] = [];
 showChat = false;
 unreadMessageCount = 0;

 // Subscriptions for cleanup
 private subscriptions: Subscription[] = [];

 constructor(
  private route: ActivatedRoute,
  private router: Router,
  private authService: AuthService,
  private joinConsultationService: JoinConsultationService,
  private consultationRoomService: ConsultationRoomService,
  private loadingController: LoadingController,
  private toastController: ToastController,
  private alertController: AlertController
 ) {
  addIcons({
   videocamOutline, videocamOffOutline, micOutline, micOffOutline,
   chatbubbleOutline, callOutline, exitOutline, personOutline,
   medicalOutline, alertCircleOutline, checkmarkCircleOutline
  });
 }

 ngOnInit() {
  const consultationIdParam = this.route.snapshot.paramMap.get('consultationId');
  if (consultationIdParam) {
   this.consultationId = parseInt(consultationIdParam);
  } else {
   this.showToast('Invalid consultation ID', 'danger');
   this.router.navigate([`/${RoutePaths.Dashboard}`]);
   return;
  }

  const user = this.authService.getCurrentUser();
  if (user?.id) {
   this.patientId = user.id;
  } else {
   this.showToast('Please log in to continue', 'warning');
   this.router.navigate([`/${RoutePaths.Login}`]);
   return;
  }

  this.initializeConsultationRoom();
  this.setupServiceSubscriptions();
 }

 ngOnDestroy() {
  // Clean up subscriptions
  this.subscriptions.forEach(sub => sub.unsubscribe());

  // Leave consultation room
  this.consultationRoomService.leaveConsultation();
 }

 /**
  * Setup subscriptions to consultation room service observables
  */
 private setupServiceSubscriptions(): void {
  // Consultation state updates
  this.subscriptions.push(
   this.consultationRoomService.consultationState$.subscribe(state => {
    this.consultationState = state;
    console.log('[ConsultationRoomPage] Consultation state updated:', state);
   })
  );

  // Media session state updates
  this.subscriptions.push(
   this.consultationRoomService.mediaSessionState$.subscribe(state => {
    this.mediaSessionState = state;
    console.log('[ConsultationRoomPage] Media session state updated:', state);
   })
  );

  this.subscriptions.push(
   this.consultationRoomService.chatMessages$.subscribe(messages => {
    this.chatMessages = messages;
    if (!this.showChat && messages.length > this.chatMessages.length) {
     this.unreadMessageCount++;
    }
   })
  );

  this.subscriptions.push(
   this.consultationRoomService.participants$.subscribe(participants => {
    this.participants = participants;
   })
  );

  this.subscriptions.push(
   this.consultationRoomService.practitionerJoined$.subscribe(data => {
    this.showToast(`${data.practitioner?.name || 'Doctor'} has joined the consultation`, 'success');
   })
  );

  this.subscriptions.push(
   this.consultationRoomService.practitionerLeft$.subscribe(data => {
    this.showToast('Doctor has left the consultation', 'warning');
   })
  );

  this.subscriptions.push(
   this.consultationRoomService.consultationEnded$.subscribe(data => {
    this.showToast('Consultation has ended', 'primary');
    setTimeout(() => {
     this.router.navigate([`/${RoutePaths.Dashboard}`]);
    }, 2000);
   })
  );

  this.subscriptions.push(
   this.consultationRoomService.mediaSessionReady$.subscribe(data => {
    this.showToast('Media session is ready', 'success');
   })
  );
 }

 async initializeConsultationRoom() {
  this.isLoading = true;

  try {
   // Check if patient should be in consultation room
   const response = await this.joinConsultationService
    .checkSessionStatus(this.consultationId);

   if (response?.redirectTo === 'waiting-room') {
    // Patient should be in waiting room, redirect
    this.showToast('Please wait to be admitted by the doctor', 'warning');
    this.router.navigate([`/${RoutePaths.WaitingRoom.replace(':consultationId', this.consultationId.toString())}`]);
    return;
   }

   // Initialize consultation room with full backend integration
   await this.consultationRoomService.initializeConsultationRoom(
    this.consultationId,
    this.patientId,
    {
     autoConnectMedia: true,
     enableChat: true,
     requestTimeout: 30000
    }
   );

   // Setup media devices after successful initialization
   await this.setupMediaDevices();

  } catch (error) {
   console.error('Error initializing consultation room:', error);
   this.showToast('Error loading consultation room. Please try again.', 'danger');
  } finally {
   this.isLoading = false;
  }
 } async setupMediaDevices() {
  try {
   // Request camera and microphone permissions
   const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
   });

   const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
   if (localVideo) {
    localVideo.srcObject = stream;
   }

   // Update media status
   this.consultationState.mediaStatus.videoEnabled = true;
   this.consultationState.mediaStatus.audioEnabled = true;

   console.log('[ConsultationRoomPage] Media devices setup successfully');

  } catch (error) {
   console.error('Error accessing media devices:', error);
   this.showToast('Unable to access camera/microphone. Please check permissions.', 'warning');
  }
 }

 async toggleVideo() {
  const newVideoState = !this.consultationState.mediaStatus.videoEnabled;

  try {
   await this.consultationRoomService.toggleVideo(newVideoState);

   // Update local video stream
   const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
   if (localVideo && localVideo.srcObject) {
    const stream = localVideo.srcObject as MediaStream;
    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach(track => {
     track.enabled = newVideoState;
    });
   }

   const message = newVideoState ? 'Camera turned on' : 'Camera turned off';
   this.showToast(message, 'primary');
  } catch (error) {
   console.error('Failed to toggle video:', error);
   this.showToast('Failed to toggle camera', 'danger');
  }
 }

 async toggleAudio() {
  const newAudioState = !this.consultationState.mediaStatus.audioEnabled;

  try {
   await this.consultationRoomService.toggleAudio(newAudioState);

   // Update local audio stream
   const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
   if (localVideo && localVideo.srcObject) {
    const stream = localVideo.srcObject as MediaStream;
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach(track => {
     track.enabled = newAudioState;
    });
   }

   const message = newAudioState ? 'Microphone turned on' : 'Microphone turned off';
   this.showToast(message, 'primary');
  } catch (error) {
   console.error('Failed to toggle audio:', error);
   this.showToast('Failed to toggle microphone', 'danger');
  }
 }

 toggleChat() {
  this.showChat = !this.showChat;
  if (this.showChat) {
   this.unreadMessageCount = 0;
  }
 }

 async sendChatMessage(content: string) {
  if (!content.trim()) return;

  try {
   await this.consultationRoomService.sendChatMessage(
    this.consultationId,
    this.patientId,
    content.trim()
   );
  } catch (error) {
   console.error('Failed to send chat message:', error);
   this.showToast('Failed to send message', 'danger');
  }
 }

 async endConsultation() {
  const alert = await this.alertController.create({
   header: 'End Consultation',
   message: 'Are you sure you want to end this consultation?',
   buttons: [
    {
     text: 'Cancel',
     role: 'cancel'
    },
    {
     text: 'End Consultation',
     handler: async () => {
      try {
       await this.consultationRoomService.endConsultation(this.consultationId);
       this.showToast('Consultation ended successfully', 'success');
       this.router.navigate([`/${RoutePaths.Dashboard}`]);
      } catch (error) {
       console.error('Failed to end consultation:', error);
       this.showToast('Failed to end consultation', 'danger');
      }
     }
    }
   ]
  });

  await alert.present();
 }

 async leaveConsultation() {
  const alert = await this.alertController.create({
   header: 'Leave Consultation',
   message: 'You can rejoin this consultation anytime before it ends.',
   buttons: [
    {
     text: 'Cancel',
     role: 'cancel'
    },
    {
     text: 'Leave',
     handler: async () => {
      try {
       await this.consultationRoomService.leaveConsultation();
       this.showToast('Left consultation successfully', 'success');
       this.router.navigate([`/${RoutePaths.Dashboard}`]);
      } catch (error) {
       console.error('Failed to leave consultation:', error);
       this.showToast('Failed to leave consultation', 'danger');
      }
     }
    }
   ]
  });

  await alert.present();
 }

 // Utility methods for template access
 get connectionStatus(): string {
  switch (this.consultationState.sessionStatus) {
   case 'connecting': return 'Connecting to consultation...';
   case 'active': return this.consultationState.isConnected ? 'Connected' : 'Connection issues';
   case 'ended': return 'Consultation ended';
   case 'error': return 'Connection failed';
   default: return 'Unknown status';
  }
 }

 get isVideoEnabled(): boolean {
  return this.consultationState.mediaStatus.videoEnabled;
 }

 get isAudioEnabled(): boolean {
  return this.consultationState.mediaStatus.audioEnabled;
 }

 get isConnected(): boolean {
  return this.consultationState.isConnected;
 }

 get practitionerPresent(): boolean {
  return this.consultationState.practitionerPresent;
 }

 get practitionerName(): string {
  return this.consultationState.practitionerName || 'Doctor';
 }

 private disconnectMedia() {
  const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
  if (localVideo && localVideo.srcObject) {
   const stream = localVideo.srcObject as MediaStream;
   stream.getTracks().forEach(track => {
    track.stop();
   });
   localVideo.srcObject = null;
  }
 }

 private async showToast(message: string, color: string) {
  const toast = await this.toastController.create({
   message,
   duration: 3000,
   color,
   position: 'top',
  });
  toast.present();
 }
}

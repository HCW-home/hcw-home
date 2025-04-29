import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController, ToastController, AlertController } from '@ionic/angular';
import {
  IonHeader, 
  IonToolbar, 
  IonContent, 
  IonBackButton, 
  IonButtons,
  IonIcon
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { 
  videocam, 
  videocamOutline, 
  videocamOff, 
  mic, 
  micOff, 
  call, 
  checkmarkCircle, 
  timeOutline,
  lockClosed,
  share,
  chatbubble,
  settingsOutline,
  documentTextOutline,
  helpCircleOutline,
  wifi,
  people
} from 'ionicons/icons';
import { Subscription, interval } from 'rxjs';
import { ConsultationService } from '../services/consultation.service';

@Component({
  selector: 'app-consultation',
  templateUrl: './consultation.page.html',
  styleUrls: ['./consultation.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonBackButton,
    IonButtons,
    IonIcon,
    CommonModule
  ]
})
export class ConsultationPage implements OnInit, OnDestroy {
  consultationId: number = 0;
  videoOff: boolean = false;
  audioMuted: boolean = false;
  callDuration: string = '00:00';
  
  // Doctor info - now initialized with default values
  doctorName = 'Loading...';
  
  // Connection variables
  isConnected = true;
  connectionQuality = 'Excellent';
  participantCount = 2;
  
  private timerSubscription: Subscription | undefined;
  private callStartTime: number;

  constructor(
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private consultationService: ConsultationService
  ) {
    this.callStartTime = Date.now();
    
    addIcons({
      videocam,
      videocamOutline,
      videocamOff,
      mic,
      micOff,
      call,
      checkmarkCircle,
      timeOutline,
      lockClosed,
      share,
      chatbubble,
      settingsOutline,
      documentTextOutline,
      helpCircleOutline,
      wifi,
      people
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const idParam = params.get('id');
      this.consultationId = idParam ? Number(idParam) : 0;
      
      // Load consultation details including doctor information
      if (this.consultationId) {
        this.loadConsultationDetails(this.consultationId);
      }
    });
    
    this.startCallTimer();
  }
  
  loadConsultationDetails(consultationId: number) {
    // In a real application, this would call an API to get consultation details
    // For this example, we're simulating the API call
    
    // Simulated API call to get doctor name from the active consultations
    this.consultationService.getActiveConsultations(1).subscribe({
      next: (response) => {
        if (response.success && response.consultations) {
          const consultation = response.consultations.find(c => c.id === consultationId);
          if (consultation && consultation.practitioner && consultation.practitioner.length > 0) {
            const practitioner = consultation.practitioner[0].user;
            this.doctorName = `Dr. ${practitioner.firstName} ${practitioner.lastName}`;
          } else {
            this.doctorName = 'Dr. Test Doctor'; // Fallback if doctor info is not found
          }
        }
        
        // Show welcome toast after we've tried to get the doctor name
        setTimeout(() => {
          this.showToast(`Connected to consultation with ${this.doctorName}`);
        }, 1000);
      },
      error: (error) => {
        console.error('Error loading consultation details', error);
        this.doctorName = 'Dr. Test Doctor'; // Fallback if there's an error
        
        // Show welcome toast even if there was an error
        setTimeout(() => {
          this.showToast(`Connected to consultation with ${this.doctorName}`);
        }, 1000);
      }
    });
  }
  
  ngOnDestroy() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }
  
  startCallTimer() {
    this.timerSubscription = interval(1000).subscribe(() => {
      const elapsedSeconds = Math.floor((Date.now() - this.callStartTime) / 1000);
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      this.callDuration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    });
  }
  
  toggleMute() {
    this.audioMuted = !this.audioMuted;
    this.showToast(this.audioMuted ? 'Microphone muted' : 'Microphone unmuted');
  }
  
  toggleVideo() {
    this.videoOff = !this.videoOff;
    this.showToast(this.videoOff ? 'Camera turned off' : 'Camera turned on');
  }
  
  endCall() {
    this.confirmEndCall();
  }
  
  openChat() {
    this.showToast('Chat opened');
  }
  
  shareScreen() {
    this.showToast('Screen sharing requested');
  }
  
  openSettings() {
    this.showToast('Settings opened');
  }
  
  openDocuments() {
    this.showToast('Documents opened');
  }
  
  getSupport() {
    this.showToast('Support requested');
  }
  
  async showToast(message: string, duration: number = 3000) {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: duration,
      position: 'top',
      color: 'dark',
      cssClass: 'notification-toast'
    });
    await toast.present();
  }
  
  async confirmEndCall() {
    const alert = await this.alertCtrl.create({
      header: 'End Consultation',
      message: 'Are you sure you want to end this consultation?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'End Call',
          role: 'destructive',
          handler: () => {
            this.navCtrl.navigateRoot('/tabs/tab1');
            
            // For demo purposes: show an ending toast
            setTimeout(() => {
              this.showToast('Consultation ended');
            }, 500);
          }
        }
      ]
    });
    
    await alert.present();
  }
} 
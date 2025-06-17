import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonIcon, IonContent, IonCardContent, IonCard, IonButton, IonCardHeader, IonTextarea } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { HeaderComponent } from 'src/app/components/header/header.component';
@Component({
  standalone: true,
  selector: 'app-post-feedback',
  templateUrl: './post-consultation-feedback.page.html',
  styleUrls: ['./post-consultation-feedback.page.scss'],
  imports: [HeaderComponent, ReactiveFormsModule, CommonModule, IonIcon, IonContent, IonCardContent, IonCard, IonButton, IonCardHeader, IonTextarea]
})


export class PostConsultationFeedbackPage implements OnInit {
  feedbackForm!: FormGroup;
  // feedbackForm: FormGroup;
  mood: 'happy' | 'neutral' | 'sad' | '' = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.feedbackForm = this.fb.group({
      comment: [''],
      type: ['']
    });
  }

  selectMood(value: 'happy' | 'neutral' | 'sad') {
    this.mood = value;
  }

  async submit() {
    const feedback = {
      mood: this.mood,
      ...this.feedbackForm.value
    };

    const toast = await this.toastCtrl.create({
      message: 'Thanks for your feedback!',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    this.router.navigate(['/patient-dashboard']);
  }

  close() {
    this.router.navigate(['/patient-dashboard']);
  }
    skipFeedback() {
    this.router.navigate(['/patient-dashboard']);
  }
}

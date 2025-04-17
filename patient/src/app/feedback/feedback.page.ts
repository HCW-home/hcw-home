import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonHeader, IonToolbar, IonTitle, IonContent, 
  IonInput, IonButton, IonItem, IonLabel
} from '@ionic/angular/standalone';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.page.html',
  styleUrls: ['./feedback.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonInput, IonButton, IonItem, IonLabel
  ]
})
export class FeedbackPage {
  consultationId: string = '';
  rating: number = 0;
  comments: string = '';

  constructor(private route: ActivatedRoute) {
    this.consultationId = this.route.snapshot.paramMap.get('id') || '';
  }

  submitFeedback() {
    console.log('Feedback submitted:', {
      consultationId: this.consultationId,
      rating: this.rating,
      comments: this.comments
    });
    // Add your feedback submission logic here
  }
}
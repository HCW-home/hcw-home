import { Component, Input } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-review-modal',
    standalone: true,
    imports: [
        IonicModule,
        CommonModule,
        FormsModule
    ],
    template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Write a Review</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="rating-container">
        <ion-label>Rate your experience</ion-label>
        <div class="stars">
          <ion-icon 
            *ngFor="let star of [1,2,3,4,5]" 
            [name]="rating >= star ? 'star' : 'star-outline'"
            (click)="rating = star">
          </ion-icon>
        </div>
      </div>

      <ion-item>
        <ion-label position="stacked">Your feedback</ion-label>
        <ion-textarea 
          [(ngModel)]="comment"
          placeholder="Share your experience..."
          rows="4">
        </ion-textarea>
      </ion-item>

      <ion-button expand="block" 
                  (click)="submitReview()" 
                  [disabled]="!rating"
                  class="ion-margin-top">
        Submit Review
      </ion-button>
    </ion-content>
  `,
    styles: [`
    .rating-container {
      padding: 16px 0;
      text-align: center;
    }
    .stars {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 12px;
    }
    ion-icon {
      font-size: 24px;
      color: #fbbf24;
      cursor: pointer;
    }
  `]
})
export class ReviewModalComponent {
    @Input() consultation: any;
    rating: number = 0;
    comment: string = '';

    constructor(private modalCtrl: ModalController) { }

    dismiss() {
        this.modalCtrl.dismiss();
    }

    submitReview() {
        this.modalCtrl.dismiss({
            rating: this.rating,
            comment: this.comment
        });
    }
}
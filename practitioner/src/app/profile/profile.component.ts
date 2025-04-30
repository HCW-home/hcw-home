import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { UserService } from '../services/user.service';
import { MessageService, User } from '../models/user.model';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatRadioModule,
    MatButtonModule,
    MatSelectModule
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  profileForm!: FormGroup;
  notificationForm!: FormGroup;
  user: User | null = null;
  messageServiceOptions = Object.values(MessageService).filter(
    val => val === MessageService.SMS || val === MessageService.WHATSAPP
  );
  
  // Temporary user ID - should be replaced with actual auth user ID
  userId = 1;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.initForms();
    this.loadUserProfile();
  }

  initForms(): void {
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      phoneNumber: ['', Validators.required],
      country: ['', Validators.required],
      language: ['', Validators.required]
    });

    this.notificationForm = this.fb.group({
      notificationsEnabled: [false],
      notificationPhoneNumber: ['', [
        Validators.pattern(/^\+?[0-9]{10,15}$/) // Basic international phone validation
      ]],
      preferredNotificationChannel: [null]
    });

    // Add conditional validator for notification phone and channel
    this.notificationForm.get('notificationsEnabled')?.valueChanges.subscribe(enabled => {
      const phoneControl = this.notificationForm.get('notificationPhoneNumber');
      const channelControl = this.notificationForm.get('preferredNotificationChannel');
      
      if (enabled) {
        phoneControl?.setValidators([Validators.required, Validators.pattern(/^\+?[0-9]{10,15}$/)]);
        channelControl?.setValidators([Validators.required]);
      } else {
        phoneControl?.clearValidators();
        channelControl?.clearValidators();
      }
      
      phoneControl?.updateValueAndValidity();
      channelControl?.updateValueAndValidity();
    });
  }

  loadUserProfile(): void {
    this.userService.getUserProfile(this.userId).subscribe({
      next: (response) => {
        this.user = response.data;
        if (this.user) {
          this.updateForms(this.user);
        }
      },
      error: (error) => {
        this.toastService.show('Failed to load user profile. Please try again.', 'error');
        console.error('Error loading user profile:', error);
      }
    });
  }

  updateForms(user: User): void {
    this.profileForm.patchValue({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      country: user.country,
      language: user.language
    });

    this.notificationForm.patchValue({
      notificationsEnabled: user.notificationsEnabled || false,
      notificationPhoneNumber: user.notificationPhoneNumber || user.phoneNumber,
      preferredNotificationChannel: user.preferredNotificationChannel || null
    });
  }

  saveNotificationPreferences(): void {
    if (this.notificationForm.invalid) {
      return;
    }

    const preferences = this.notificationForm.value;
    this.userService.updateNotificationPreferences(this.userId, preferences).subscribe({
      next: (response) => {
        this.toastService.show('Notification preferences updated successfully', 'success');
      },
      error: (error) => {
        this.toastService.show('Failed to update notification preferences. Please try again.', 'error');
        console.error('Error updating notification preferences:', error);
      }
    });
  }
} 
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController, AlertController } from '@ionic/angular';
import { AuthService, User } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage implements OnInit {
  profileForm: FormGroup;
  user: User | null = null;
  isLoading = false;
  isEditing = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    this.profileForm = this.formBuilder.group({
      name: ['', Validators.required],
      email: [{ value: '', disabled: true }],
      phoneNumber: ['', [Validators.pattern('^[0-9]{10}$')]],
      dateOfBirth: [''],
      address: ['']
    });
  }

  ngOnInit() {
    this.loadUserProfile();
  }

  ionViewWillEnter() {
    this.loadUserProfile();
  }

  loadUserProfile() {
    this.user = this.authService.getCurrentUser();
    
    if (this.user) {
      this.profileForm.patchValue({
        name: this.user.name || '',
        email: this.user.email
      });
      
      // Here we would load additional patient profile data from an API
      // For now, we'll just use placeholder data
      this.profileForm.patchValue({
        phoneNumber: '',
        dateOfBirth: '',
        address: ''
      });
    }
  }

  toggleEditMode() {
    this.isEditing = !this.isEditing;
    
    if (!this.isEditing) {
      // Reset form to original values if cancelling edit
      this.loadUserProfile();
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) {
      return;
    }

    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: 'Saving profile...',
      spinner: 'circles'
    });
    await loading.present();

    // Here we would call an API to update the profile
    // For now, we'll just simulate a successful update
    setTimeout(async () => {
      loading.dismiss();
      this.isLoading = false;
      this.isEditing = false;
      
      const toast = await this.toastController.create({
        message: 'Profile updated successfully',
        duration: 3000,
        position: 'bottom',
        color: 'success'
      });
      toast.present();
    }, 1000);
  }

  async logout() {
    const alert = await this.alertController.create({
      header: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Logout',
          handler: () => {
            this.authService.logout();
          }
        }
      ]
    });

    await alert.present();
  }
}

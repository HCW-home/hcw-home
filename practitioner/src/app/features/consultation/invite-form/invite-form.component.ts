import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ConsultationService } from '../../../core/consultation/services/consultation.service';
import { MessageApiService } from '../../../core/consultation/services/message.service';
import { MessageService } from '../../../core/consultation/models/message-type.model';
import { Consultation, InviteFormData } from '../../../core/consultation/models/consultation.model';

@Component({
  selector: 'app-invite-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './invite-form.component.html',
  styleUrls: ['./invite-form.component.scss']
})
export class InviteFormComponent implements OnInit {
  inviteForm!: FormGroup;
  messageTypes = Object.values(MessageService);
  whatsAppTemplates: {id: string, name: string, description: string}[] = [];
  languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' }
    // Add more languages as needed
  ];
  isSubmitting = false;
  submissionSuccess = false;
  submissionError = '';
  generatedMagicLink = '';
  linkCopied = false;

  constructor(
    private fb: FormBuilder,
    private consultationService: ConsultationService,
    private messageService: MessageApiService
  ) {}

  ngOnInit(): void {
    this.initForm();
    
    // Load WhatsApp templates if needed
    this.loadWhatsAppTemplates();
    
    this.inviteForm.get('messageService')?.valueChanges.subscribe(value => {
      this.updateFormValidation(value);
    });
  }

  initForm(): void {
    this.inviteForm = this.fb.group({
      patientName: ['', [Validators.required]],
      patientEmail: [''],
      patientPhone: [''],
      language: ['en', [Validators.required]],
      messageService: [MessageService.EMAIL, [Validators.required]], 
      introMessage: [''],
      templateId: ['']
    });
    
    // Initialize validation based on default message type
    this.updateFormValidation(this.inviteForm.get('messageService')?.value);
  }

  updateFormValidation(messageService: MessageService): void {
    const emailControl = this.inviteForm.get('patientEmail');
    const phoneControl = this.inviteForm.get('patientPhone');
    const templateControl = this.inviteForm.get('templateId');
    
    // Reset validators
    emailControl?.clearValidators();
    phoneControl?.clearValidators();
    templateControl?.clearValidators();
    
    // Apply validators based on message type
    switch (messageService) {
      case MessageService.EMAIL:
        emailControl?.setValidators([Validators.required, Validators.email]);
        break;
      case MessageService.SMS:
      case MessageService.WHATSAPP:
        phoneControl?.setValidators([Validators.required]);
        break;
      case MessageService.MANUALLY:
        // No specific validation for manual sharing
        break;
    }
    
    
    // Special case for WhatsApp template
    if (messageService === MessageService.WHATSAPP) {
      templateControl?.setValidators([Validators.required]);
    }
    
    // Update validation
    emailControl?.updateValueAndValidity();
    phoneControl?.updateValueAndValidity();
    templateControl?.updateValueAndValidity();
  }

  loadWhatsAppTemplates(): void {
    this.messageService.getWhatsAppTemplates().subscribe(
      templates => {
        if (templates && templates.length > 0) {
          this.whatsAppTemplates = templates;
        } else {
          this.whatsAppTemplates = [
            { id: 'template1', name: 'Appointment Reminder', description: 'Reminds patients of upcoming appointments' },
            { id: 'template2', name: 'Medication Reminder', description: 'Reminds patients to take their medication' },
            { id: 'template3', name: 'Follow-up Notification', description: 'Notifies patients about follow-up consultations' }
          ];
        }
      },
      error => {
        console.error('Error loading WhatsApp templates (using mock data instead):', error);
        this.whatsAppTemplates = [
          { id: 'template1', name: 'Appointment Reminder', description: 'Reminds patients of upcoming appointments' },
          { id: 'template2', name: 'Medication Reminder', description: 'Reminds patients to take their medication' },
          { id: 'template3', name: 'Follow-up Notification', description: 'Notifies patients about follow-up consultations' }
        ];
      }
    );
  }

  onSubmit(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    
    this.isSubmitting = true;
    this.submissionSuccess = false;
    this.submissionError = '';
    this.generatedMagicLink = '';
    this.linkCopied = false;
    
    const formData: InviteFormData = this.inviteForm.value;
    
    this.consultationService.createConsultationInvite(formData).subscribe(
      (response: Consultation) => {
        this.isSubmitting = false;
        this.submissionSuccess = true;
        
        console.log('Consultation response:', response);
        
        // Check if response has magicLink directly
        if (response && response.magicLink) {
          this.generatedMagicLink = response.magicLink;
          console.log('Magic link from response:', this.generatedMagicLink);
        }
        // If not, and it's MANUALLY delivery method, try to generate one
        else if (formData.messageService === MessageService.MANUALLY && response.id) {
          this.messageService.generateMagicLink(response.id).subscribe(
            linkData => {
              this.generatedMagicLink = linkData.link;
              console.log('Generated magic link:', this.generatedMagicLink);
            },
            error => {
              console.error('Error generating magic link:', error);
              this.submissionError = 'Consultation created but failed to generate magic link.';
            }
          );
        }
        
        // Don't reset form right away if we're showing the magic link
        if (formData.messageService !== MessageService.MANUALLY) {
          this.resetForm();
        }
      },
      error => {
        this.isSubmitting = false;
        this.submissionSuccess = false;
        this.submissionError = 'Failed to create consultation invite. Please try again.';
        console.error('Invitation error:', error);
      }
    );
  }

  resetForm(): void {
    this.inviteForm.reset({
      messageService: MessageService.EMAIL,
      language: 'en'
    });
  }
  
  /**
   * Copy text to clipboard
  */
 copyToClipboard(text: string): void {
   navigator.clipboard.writeText(text).then(
      () => {
        this.linkCopied = true;
        console.log('Link copied to clipboard');
        // Reset the copied message after 3 seconds
        setTimeout(() => this.linkCopied = false, 3000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  }
}
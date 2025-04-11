import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MessageService as MessageServiceType } from '../models/message-type.model';

interface MessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface MessageRequest {
  consultationId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  messageService: MessageServiceType;
  message: string;
  templateId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MessageApiService {
  private apiUrl = '/api'; 


  private mockTemplates = [
    { id: 'template1', name: 'Appointment Reminder', description: 'Reminds patients of upcoming appointments' },
    { id: 'template2', name: 'Medication Reminder', description: 'Reminds patients to take their medication' },
    { id: 'template3', name: 'Follow-up Notification', description: 'Notifies patients about follow-up consultations' }
  ];

  constructor(private http: HttpClient) {}

  /**
   * Sends a message via the specified channel (SMS, EMAIL, WHATSAPP)
   */
  sendMessage(request: MessageRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.apiUrl}/messages/send`, request);
  }

  /**
   * Get WhatsApp templates from the API
   */
  getWhatsAppTemplates(): Observable<any[]> {
    return of(this.mockTemplates);
    // if we want to get the templates from a endpoint then we would do this-> 
    // return this.http.get<any[]>(`${this.apiUrl}/consultation/whatsapp-templates`)
    //   .pipe(
    //     catchError(error => {
    //       console.error('Failed to fetch WhatsApp templates:', error);
    //       return of(this.mockTemplates);
    //     })
    //   );
  }

  /**
   * Generate a magic link for a consultation
   */
  generateMagicLink(consultationId: string): Observable<{link: string}> {
    return this.http.get<{link: string}>(`${this.apiUrl}/consultation/${consultationId}/magic-link`);
  }
}
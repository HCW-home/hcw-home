import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { ToastService } from '../../services/toast/toast.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Re-export ChatMessage for external components
export type { ChatMessage } from '../../services/chat.service';


export interface TypingIndicator {
  userId: number;
  userName: string;
  typing: boolean;
}

@Component({
  selector: 'app-practitioner-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './practitioner-chat.component.html',
  styleUrls: ['./practitioner-chat.component.scss']
})
export class PractitionerChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Output() sendMessage = new EventEmitter<string>();
  @Output() sendFile = new EventEmitter<File>();
  searchQuery: string = '';
  filterType: 'all' | 'text' | 'image' | 'file' = 'all';
  @Input() messages: ChatMessage[] = [];
  @Input() consultationId!: number;
  @Input() practitionerId!: number;
  @Input() practitionerName!: string;
  @Input() isVisible: boolean = true;
  @Input() unreadCount: number = 0;
  @Input() typingUsers: TypingIndicator[] = [];
  @Input() participants: Array<{ id: number; firstName: string; lastName: string; role: string }> = [];
  @ViewChild('messagesContainer', { static: false }) messagesContainer!: ElementRef;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;
  newMessage: string = '';
  isTyping: boolean = false;
  typingTimeout?: number;
  selectedFile?: File;
  isUploading: boolean = false;
  uploadProgress: number = 0;
  uploadError: string = '';
  messageSendError: string = '';
  showScrollToBottom: boolean = false;
  private shouldScrollToBottom = true;
  private chatSubs: any[] = [];

  constructor(private chatService: ChatService, private toastService: ToastService) { }

  // Filtered messages for display (stub: returns all messages, add filter logic as needed)
  get filteredMessages(): ChatMessage[] {
    return this.messages;
  }

  trackByMessageId(index: number, message: ChatMessage): number | string {
    return message.id ?? index;
  }

  openImagePreview(mediaUrl: string): void {
    window.open(mediaUrl, '_blank');
  }

  // Keydown event handler (stub)
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSendMessage();
    }
  }

  ngOnInit() {
    // Mark messages as read when chat is initialized
    if (this.unreadCount > 0) {
      this.markAllAsRead();
    }
    // Subscribe to real-time chat events
    this.chatSubs.push(
      this.chatService.onNewMessage().subscribe((msg: ChatMessage) => {
        if (msg.consultationId === this.consultationId) {
          this.messages = [...this.messages, msg];
          this.shouldScrollToBottom = true;
        }
      })
    );
    // Typing indicator
    this.chatSubs.push(
      this.chatService.onTyping().subscribe(data => {
        if (data.consultationId === this.consultationId) {
          this.typingUsers = [{ userId: data.userId, userName: 'Patient', typing: true }];
        }
      })
    );
    // Read receipts
    this.chatSubs.push(
      this.chatService.onReadReceipt().subscribe(data => {
        if (data.consultationId === this.consultationId) {
          this.updateMessageStatus(data.messageId, 'read');
        }
      })
    );
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy() {
    this.chatSubs.forEach(sub => sub.unsubscribe());
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }

  async onSendMessage() {
    const messageContent = this.newMessage.trim();
    if (!messageContent) return;
    try {
      // Ensure backend connection before sending
      const isConnected = await this.chatService.getConnectionState().toPromise();
      if (!isConnected) {
        this.messageSendError = 'Chat connection lost. Please try again.';
        this.toastService.showError(this.messageSendError);
        return;
      }
      this.sendMessage.emit(messageContent);
      this.newMessage = '';
      this.stopTypingIndicator();
      this.shouldScrollToBottom = true;
    } catch (err: any) {
      this.messageSendError = err?.message || 'Failed to send message.';
      this.toastService.showError(this.messageSendError);
    }
  }

  onInputChange() {
    if (this.newMessage.trim() && !this.isTyping) {
      this.startTypingIndicator();
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.typingTimeout = window.setTimeout(() => {
      this.stopTypingIndicator();
    }, 3000);
  }

  startTypingIndicator() {
    this.isTyping = true;
    this.chatService.sendTyping(this.consultationId, this.practitionerId);
  }

  updateMessageStatus(messageId: number, status: 'sent' | 'read'): void {
    this.messages = this.messages.map((msg: any) =>
      Number(msg.id) === messageId ? { ...msg, deliveryStatus: status } : msg
    );
  }

  stopTypingIndicator() {
    if (this.isTyping) {
      this.isTyping = false;
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = undefined;
      }
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        this.uploadError = 'File too large. Maximum size is 10MB.';
        this.toastService.showError(this.uploadError);
        return;
      }
      this.selectedFile = file;
      this.sendFile.emit(file);
    }
  }

  openFileDialog() {
    this.fileInput.nativeElement.click();
  }

  removeSelectedFile() {
    this.selectedFile = undefined;
  }

  markAllAsRead() {
    // Emit read receipt for all unread messages
    this.messages.forEach(msg => {
      if (msg.deliveryStatus !== 'read') {
        this.chatService.sendReadReceipt(this.consultationId, Number(msg.id), this.practitionerId);
      }
    });
  }

  scrollToBottom() {
    if (this.messagesContainer?.nativeElement) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  onScroll() {
    if (this.messagesContainer?.nativeElement) {
      const element = this.messagesContainer.nativeElement;
      const threshold = 100;
      const position = element.scrollTop + element.offsetHeight;
      const height = element.scrollHeight;
      this.showScrollToBottom = height - position > threshold;
    }
  }

  formatMessageTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  isImage(mediaType?: string): boolean {
    return mediaType?.startsWith('image/') || false;
  }

  downloadFile(message: ChatMessage) {
    if (message.mediaUrl) {
      const link = document.createElement('a');
      link.href = message.mediaUrl;
      link.download = message.fileName || 'download';
      link.click();
    }
  }

  getMessageInitials(message: ChatMessage): string {
    if (message.messageType === 'system') return 'SYS';
    if (message.isFromPractitioner) return 'Dr';
    return 'P';
  }

  getTypingText(): string {
    if (this.typingUsers.length === 0) return '';
    if (this.typingUsers.length === 1) {
      return `${this.typingUsers[0].userName} is typing...`;
    } else if (this.typingUsers.length === 2) {
      return `${this.typingUsers[0].userName} and ${this.typingUsers[1].userName} are typing...`;
    } else {
      return `${this.typingUsers[0].userName} and ${this.typingUsers.length - 1} others are typing...`;
    }
  }

  getReadReceiptSummary(message: ChatMessage): string {
    if (!message.readReceipts || message.readReceipts.length === 0) {
      return 'Not read';
    }
    const readCount = message.readReceipts.length;
    const totalParticipants = this.participants.length;
    if (readCount === totalParticipants) {
      return 'Read by all';
    } else if (readCount === 1) {
      return `Read by ${message.readReceipts[0].user.firstName}`;
    } else {
      return `Read by ${readCount} participants`;
    }
  }
}

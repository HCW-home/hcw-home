import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { ToastService } from '../../services/toast/toast.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


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
  @Input() canLoadMore: boolean = false;
  @Output() loadMoreMessages = new EventEmitter<void>();
  @ViewChild('messagesContainer', { static: false }) messagesContainer!: ElementRef;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;
  newMessage: string = '';
  isTyping: boolean = false;
  typingTimeout?: number;
  selectedFile?: File;
  isUploading: boolean = false;
  isLoadingMore: boolean = false;
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

  /**
   * Load more messages handler
   */
  onLoadMoreMessages(): void {
    if (this.isLoadingMore || !this.canLoadMore) {
      return;
    }

    this.isLoadingMore = true;
    this.loadMoreMessages.emit();

    // Reset loading state after 5 seconds (timeout)
    setTimeout(() => {
      this.isLoadingMore = false;
    }, 5000);
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
    if (!messageContent) {
      return;
    }

    try {
      // Emit the message to parent component (consultation room)
      this.sendMessage.emit(messageContent);

      // Clear input and stop typing indicator
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

  /**
   * Get file preview type for inline rendering
   */
  getFilePreviewType(message: ChatMessage): 'image' | 'video' | 'audio' | 'file' {
    // Check messageType first
    if (message.messageType === 'image') {
      return 'image';
    }
    if (message.messageType === 'file') {
      // For file type, need to check filename extension
      const fileName = message.fileName?.toLowerCase();
      if (fileName) {
        if (fileName.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
          return 'video';
        }
        if (fileName.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) {
          return 'audio';
        }
        if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)) {
          return 'image';
        }
      }
    }

    // Fallback to filename extension detection
    const fileName = message.fileName?.toLowerCase();
    if (fileName) {
      if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)) {
        return 'image';
      }
      if (fileName.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
        return 'video';
      }
      if (fileName.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) {
        return 'audio';
      }
    }

    // Check media URL
    const mediaPath = message.mediaUrl || '';
    if (mediaPath.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)) {
      return 'image';
    }
    if (mediaPath.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
      return 'video';
    }
    if (mediaPath.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) {
      return 'audio';
    }

    return 'file';
  }

  /**
   * Get the media URL for display
   */
  getMediaUrl(message: ChatMessage): string {
    return message.mediaUrl || '';
  }

  /**
   * Download file handler
   */
  downloadFile(message: ChatMessage): void {
    const url = this.getMediaUrl(message);
    if (!url) {
      this.toastService.showError('File URL not available');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = message.fileName || 'download';
      link.target = '_blank'; // Open in new tab if download fails
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      this.toastService.showSuccess(`Downloading ${message.fileName || 'file'}...`);
    } catch (error) {
      this.toastService.showError('Failed to download file');
      console.error('Download error:', error);
    }
  }

  /**
   * Get file icon based on file type
   */
  getFileIcon(message: ChatMessage): string {
    const fileName = message.fileName?.toLowerCase() || '';

    // Documents
    if (fileName.match(/\.pdf$/i)) return '📄';
    if (fileName.match(/\.(doc|docx)$/i)) return '📝';
    if (fileName.match(/\.(xls|xlsx)$/i)) return '📊';
    if (fileName.match(/\.(ppt|pptx)$/i)) return '📽️';

    // Archives
    if (fileName.match(/\.(zip|rar|7z|tar|gz)$/i)) return '🗜️';

    // Code files
    if (fileName.match(/\.(js|ts|jsx|tsx|py|java|cpp|c|h)$/i)) return '💻';

    // DICOM medical files
    if (fileName.match(/\.dcm$/i)) return '🏥';

    // Default
    return '📎';
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


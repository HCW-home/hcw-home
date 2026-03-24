import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  signal,
  inject,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  AfterViewChecked,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Typography } from '../../ui-components/typography/typography';
import { Button } from '../../ui-components/button/button';
import { Input as InputComponent } from '../../ui-components/input/input';
import { Svg } from '../../ui-components/svg/svg';
import { ModalComponent } from '../modal/modal.component';
import { TypographyTypeEnum } from '../../constants/typography';
import { ButtonSizeEnum, ButtonStyleEnum } from '../../constants/button';
import { ConsultationService } from '../../../core/services/consultation.service';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../core/services/translation.service';

export interface MessageAttachment {
  file_name: string;
  mime_type: string;
}

export interface Message {
  id: number;
  username: string;
  message: string;
  timestamp: string;
  isCurrentUser: boolean;
  isSystem?: boolean;
  attachment?: MessageAttachment | null;
  recording_url?: string | null;
  isEdited?: boolean;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface SendMessageData {
  content?: string;
  attachment?: File;
}

export interface EditMessageData {
  messageId: number;
  content: string;
}

export interface DeleteMessageData {
  messageId: number;
}

@Component({
  selector: 'app-message-list',
  imports: [
    CommonModule,
    FormsModule,
    Typography,
    Button,
    InputComponent,
    Svg,
    ModalComponent,
    TranslatePipe,
  ],
  templateUrl: './message-list.html',
  styleUrl: './message-list.scss',
})
export class MessageList
  implements OnInit, OnChanges, OnDestroy, AfterViewChecked
{
  @Input() messages: Message[] = [];
  @Input() isConnected = false;
  @Input() hasHeaderAction = false;
  @Input() currentUserId: number | null = null;
  @Input() isLoadingMore = false;
  @Input() hasMore = true;
  @Input() unreadSeparatorTimestamp: string | null = null;
  @Output() sendMessage = new EventEmitter<SendMessageData>();
  @Output() editMessage = new EventEmitter<EditMessageData>();
  @Output() deleteMessage = new EventEmitter<DeleteMessageData>();
  @Output() loadMore = new EventEmitter<void>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('messagesContainer')
  messagesContainer!: ElementRef<HTMLDivElement>;

  editingMessageId: number | null = null;
  editContent = '';
  isEditing = false;

  private destroy$ = new Subject<void>();
  private consultationService = inject(ConsultationService);
  private t = inject(TranslationService);
  private imageUrlCache = new Map<number, string>();
  private shouldScrollToBottom = false;
  private isInitialLoad = true;
  private previousScrollHeight = 0;
  private previousMessagesLength = 0;
  private lastMessageId: number | null = null;

  viewingImage = signal<{ url: string; fileName: string } | null>(null);
  imageUrls = signal<Map<number, string>>(new Map());

  newMessage = '';
  selectedFile: File | null = null;

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;

  ngOnInit(): void {
    this.isInitialLoad = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messages']) {
      this.loadImageAttachments();
      const currentLength = this.messages.length;
      const currentLastMessage = this.messages[currentLength - 1];
      const currentLastMessageId = currentLastMessage?.id ?? null;

      // Check if this is a new message at the bottom (not a load more at the top)
      const isNewMessageAtBottom =
        currentLastMessageId !== null &&
        currentLastMessageId !== this.lastMessageId;

      // Check if messages were loaded at the top (load more)
      const wasLoadingMore =
        this.previousMessagesLength > 0 &&
        currentLength > this.previousMessagesLength &&
        !isNewMessageAtBottom;

      if (this.isInitialLoad || isNewMessageAtBottom) {
        this.shouldScrollToBottom = true;
      }

      if (wasLoadingMore && this.messagesContainer?.nativeElement) {
        this.previousScrollHeight =
          this.messagesContainer.nativeElement.scrollHeight;
      }

      this.previousMessagesLength = currentLength;
      this.lastMessageId = currentLastMessageId;
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
      this.isInitialLoad = false;
    } else if (
      this.previousScrollHeight > 0 &&
      this.messagesContainer?.nativeElement
    ) {
      const container = this.messagesContainer.nativeElement;
      const newScrollHeight = container.scrollHeight;
      if (newScrollHeight > this.previousScrollHeight) {
        container.scrollTop = newScrollHeight - this.previousScrollHeight;
        this.previousScrollHeight = 0;
      }
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const container = this.messagesContainer.nativeElement;
      container.scrollTop = container.scrollHeight;
    }
  }

  onScroll(): void {
    if (!this.messagesContainer?.nativeElement) return;

    const container = this.messagesContainer.nativeElement;
    const scrollTop = container.scrollTop;

    if (scrollTop <= 50 && !this.isLoadingMore && this.hasMore) {
      this.previousScrollHeight = container.scrollHeight;
      this.loadMore.emit();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.imageUrlCache.forEach(url => URL.revokeObjectURL(url));
    this.imageUrlCache.clear();
  }

  private loadImageAttachments(): void {
    this.messages.forEach(message => {
      const isTempId = message.id > 1000000000000;
      if (
        message.attachment &&
        this.isImageAttachment(message.attachment) &&
        !this.imageUrlCache.has(message.id) &&
        !isTempId
      ) {
        this.consultationService
          .getMessageAttachment(message.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: blob => {
              const url = URL.createObjectURL(blob);
              this.imageUrlCache.set(message.id, url);
              this.imageUrls.set(new Map(this.imageUrlCache));
            },
          });
      }
    });
  }

  getImageUrl(messageId: number): string | undefined {
    return this.imageUrls().get(messageId);
  }

  onSendMessage(): void {
    if ((this.newMessage.trim() || this.selectedFile) && this.isConnected) {
      this.sendMessage.emit({
        content: this.newMessage.trim() || undefined,
        attachment: this.selectedFile || undefined,
      });
      this.newMessage = '';
      this.selectedFile = null;
    }
  }

  openFilePicker(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  removeSelectedFile(): void {
    this.selectedFile = null;
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private firstUnreadIndex: number | null = null;
  private lastComputedSeparatorTimestamp: string | null = null;
  private lastComputedMessagesLength = 0;

  private computeFirstUnreadIndex(): void {
    if (this.unreadSeparatorTimestamp === this.lastComputedSeparatorTimestamp
        && this.messages.length === this.lastComputedMessagesLength) {
      return;
    }
    this.lastComputedSeparatorTimestamp = this.unreadSeparatorTimestamp;
    this.lastComputedMessagesLength = this.messages.length;
    this.firstUnreadIndex = null;

    if (!this.unreadSeparatorTimestamp) return;
    const separatorTime = new Date(this.unreadSeparatorTimestamp).getTime();
    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      if (!msg.isCurrentUser && !msg.isSystem && new Date(msg.timestamp).getTime() > separatorTime) {
        this.firstUnreadIndex = i;
        return;
      }
    }
  }

  shouldShowUnreadSeparator(index: number): boolean {
    this.computeFirstUnreadIndex();
    return this.firstUnreadIndex === index;
  }

  shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;

    const currentMessage = this.messages[index];
    const previousMessage = this.messages[index - 1];

    const currentDate = new Date(currentMessage.timestamp);
    const previousDate = new Date(previousMessage.timestamp);

    return currentDate.toDateString() !== previousDate.toDateString();
  }

  formatDateSeparator(timestamp: string): string {
    const messageDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const messageDateStr = messageDate.toDateString();
    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    if (messageDateStr === todayStr) {
      return this.t.instant('messageList.today');
    } else if (messageDateStr === yesterdayStr) {
      return this.t.instant('messageList.yesterday');
    } else {
      return messageDate.toLocaleDateString([], {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  }

  isImageAttachment(attachment: MessageAttachment): boolean {
    return attachment.mime_type.startsWith('image/');
  }

  getAttachmentIcon(attachment: MessageAttachment): string {
    if (attachment.mime_type.startsWith('image/')) return 'image';
    if (attachment.mime_type === 'application/pdf') return 'file-text';
    if (
      attachment.mime_type.includes('word') ||
      attachment.mime_type.includes('document')
    )
      return 'file-text';
    if (
      attachment.mime_type.includes('spreadsheet') ||
      attachment.mime_type.includes('excel')
    )
      return 'file-text';
    return 'paperclip';
  }

  openImageViewer(message: Message): void {
    const url = this.getImageUrl(message.id);
    if (
      message.attachment &&
      this.isImageAttachment(message.attachment) &&
      url
    ) {
      this.viewingImage.set({
        url,
        fileName: message.attachment.file_name,
      });
    }
  }

  closeImageViewer(): void {
    this.viewingImage.set(null);
  }

  canEditMessage(message: Message): boolean {
    return (
      message.isCurrentUser && !message.deletedAt && !message.recording_url
    );
  }

  canDeleteMessage(message: Message): boolean {
    return message.isCurrentUser && !message.deletedAt;
  }

  isMessageDeleted(message: Message): boolean {
    return !!message.deletedAt;
  }

  onDeleteClick(message: Message): void {
    this.deleteMessage.emit({ messageId: message.id });
  }

  startEdit(message: Message): void {
    this.editingMessageId = message.id;
    this.editContent = message.message;
  }

  cancelEdit(): void {
    this.editingMessageId = null;
    this.editContent = '';
  }

  saveEdit(): void {
    if (!this.editingMessageId || !this.editContent.trim()) {
      return;
    }

    this.editMessage.emit({
      messageId: this.editingMessageId,
      content: this.editContent.trim(),
    });
    this.onEditComplete();
  }

  onEditComplete(): void {
    this.editingMessageId = null;
    this.editContent = '';
    this.isEditing = false;
  }

  downloadAttachment(message: Message): void {
    if (message.attachment) {
      const filename = message.attachment.file_name;
      this.consultationService
        .getMessageAttachment(message.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: blob => {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
          },
          error: error => {
            console.error('Failed to download attachment:', error);
          },
        });
    }
  }

  downloadRecording(message: Message): void {
    if (message.recording_url) {
      const filename = this.getRecordingFilename(message.recording_url);
      this.consultationService
        .downloadMessageRecording(message.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: blob => {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
          },
          error: error => {
            console.error('Failed to download recording:', error);
          },
        });
    }
  }

  getRecordingFilename(recordingUrl: string): string {
    const parts = recordingUrl.split('/');
    return parts[parts.length - 1];
  }

  isRecording(message: Message): boolean {
    return !!message.recording_url;
  }
}

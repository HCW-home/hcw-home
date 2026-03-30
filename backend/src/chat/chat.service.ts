import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import { DatabaseService } from 'src/database/database.service';
import { CreateMessageDto, MessageType } from './dto/create-message.dto';
import { ReadMessageDto } from './dto/read-message.dto';
import { StorageService } from 'src/storage/storage.service';
import { ConfigService } from 'src/config/config.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) { }

  async createMessage(data: CreateMessageDto, file?: Express.Multer.File) {
    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;
      let fileName: string | undefined;
      let fileSize: number | undefined;
      let messageType = data.messageType || MessageType.TEXT;

      if (file) {
        this.validateFile(file);

        mediaUrl = await this.storageService.uploadFile(file);
        mediaType = file.mimetype;
        fileName = file.originalname;
        fileSize = file.size;

        // Enhanced message type determination
        messageType = this.determineMessageType(file.mimetype);

        this.logger.log(`File uploaded for message: ${mediaUrl}, type: ${messageType}, size: ${fileSize} bytes`);
      }

      await this.verifyConsultationAccess(data.userId, data.consultationId);

      const message = await this.prisma.message.create({
        data: {
          userId: data.userId,
          consultationId: data.consultationId,
          content: data.content,
          clientUuid: data.clientUuid,
          mediaUrl: mediaUrl || data.mediaUrl,
          mediaType: mediaType || data.mediaType,
          messageType,
          fileName: fileName || data.fileName,
          fileSize: fileSize || data.fileSize,
          readReceipts: {
            create: {
              userId: data.userId,
              readAt: new Date(),
            },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          readReceipts: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      this.logger.log(
        `Message created: ID ${message.id}, User ${data.userId}, Consultation ${data.consultationId}, Type: ${messageType}`,
      );

      return message;
    } catch (error) {
      this.logger.error('Failed to create message:', error);
      throw error;
    }
  }

  async getMessages(
    consultationId: number,
    limit: number = this.configService.chatMessageHistoryLimit,
    offset: number = 0,
  ) {
    try {
      const messages = await this.prisma.message.findMany({
        where: { consultationId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          readReceipts: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { readAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return messages.reverse();
    } catch (error) {
      this.logger.error('Failed to get messages:', error);
      throw error;
    }
  }

  async markMessageAsRead(data: ReadMessageDto) {
    try {
      // Check if message exists and user has access
      const message = await this.prisma.message.findFirst({
        where: {
          id: data.messageId,
          consultationId: data.consultationId,
        },
      });

      if (!message) {
        throw HttpExceptionHelper.notFound('Message not found or access denied');
      }

      await this.verifyConsultationAccess(data.userId, data.consultationId);

      // Create or update read receipt
      const readReceipt = await this.prisma.messageReadReceipt.upsert({
        where: {
          messageId_userId: {
            messageId: data.messageId,
            userId: data.userId,
          },
        },
        create: {
          messageId: data.messageId,
          userId: data.userId,
          readAt: new Date(),
        },
        update: {
          readAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      this.logger.log(
        `Message marked as read: Message ${data.messageId}, User ${data.userId}`,
      );

      return readReceipt;
    } catch (error) {
      this.logger.error('Failed to mark message as read:', error);
      throw error;
    }
  }

  async bulkMarkMessagesAsRead(
    messageIds: number[],
    userId: number,
    consultationId: number,
  ) {
    try {
      await this.verifyConsultationAccess(userId, consultationId);

      const messageCount = await this.prisma.message.count({
        where: {
          id: { in: messageIds },
          consultationId,
        },
      });

      if (messageCount !== messageIds.length) {
        throw HttpExceptionHelper.badRequest('Some messages do not belong to this consultation');
      }

      // Create read receipts for all messages that don't have them yet
      const readReceipts = await Promise.all(
        messageIds.map((messageId) =>
          this.prisma.messageReadReceipt.upsert({
            where: {
              messageId_userId: { messageId, userId },
            },
            create: {
              messageId,
              userId,
              readAt: new Date(),
            },
            update: {
              readAt: new Date(),
            },
          }),
        ),
      );

      this.logger.log(
        `Bulk marked messages as read: ${messageIds.length} messages, User ${userId}`,
      );

      return readReceipts;
    } catch (error) {
      this.logger.error('Failed to bulk mark messages as read:', error);
      throw error;
    }
  }

  async getUnreadMessageCount(
    userId: number,
    consultationId: number,
  ): Promise<number> {
    try {
      await this.verifyConsultationAccess(userId, consultationId);

      const unreadCount = await this.prisma.message.count({
        where: {
          consultationId,
          userId: { not: userId },
          readReceipts: {
            none: {
              userId,
            },
          },
        },
      });

      return unreadCount;
    } catch (error) {
      this.logger.error('Failed to get unread message count:', error);
      throw error;
    }
  }

  async getMessageReadStatus(messageId: number, consultationId: number) {
    try {
      const readReceipts = await this.prisma.messageReadReceipt.findMany({
        where: {
          messageId,
          message: {
            consultationId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { readAt: 'asc' },
      });

      return readReceipts;
    } catch (error) {
      this.logger.error('Failed to get message read status:', error);
      throw error;
    }
  }

  async createSystemMessage(consultationId: number, content: string) {
    const message = await this.prisma.message.create({
      data: {
        consultationId,
        content,
        isSystem: true,
        messageType: MessageType.SYSTEM,
        userId: 0, // A user ID of 0 can represent the system
        clientUuid: 'system-message',
      },
    });
    return message;
  }

  /**
   * Get consultation participants for read receipts
   */
  async getConsultationParticipants(consultationId: number) {
    try {
      const participants = await this.prisma.participant.findMany({
        where: { consultationId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      return participants.map(p => p.user);
    } catch (error) {
      this.logger.error('Failed to get consultation participants:', error);
      throw error;
    }
  }

  /**
   * Mark all messages as read for a user in a consultation
   */
  async markAllMessagesAsReadForUser(
    userId: number,
    consultationId: number,
  ) {
    try {
      await this.verifyConsultationAccess(userId, consultationId);

      // Get all unread messages for this user in the consultation
      const unreadMessages = await this.prisma.message.findMany({
        where: {
          consultationId,
          userId: { not: userId }, // Don't mark own messages
          readReceipts: {
            none: {
              userId,
            },
          },
        },
        select: { id: true },
      });

      if (unreadMessages.length === 0) {
        return [];
      }

      // Create read receipts for all unread messages
      const readReceiptsData = unreadMessages.map(msg => ({
        messageId: msg.id,
        userId,
        readAt: new Date(),
      }));

      const readReceipts = await this.prisma.messageReadReceipt.createMany({
        data: readReceiptsData,
        skipDuplicates: true,
      });

      this.logger.log(
        `Marked ${unreadMessages.length} messages as read for user ${userId} in consultation ${consultationId}`,
      );

      return readReceipts;
    } catch (error) {
      this.logger.error('Failed to mark all messages as read:', error);
      throw error;
    }
  }

  /**
   * Get typing users for a consultation
   */
  private typingUsers = new Map<string, {
    userId: number;
    consultationId: number;
    userName: string;
    timeout: NodeJS.Timeout;
  }>();

  setUserTyping(userId: number, consultationId: number, userName: string): void {
    const key = `${userId}-${consultationId}`;

    // Clear existing timeout
    const existing = this.typingUsers.get(key);
    if (existing?.timeout) {
      clearTimeout(existing.timeout);
    }

    // Set new timeout (user stops typing after configured inactivity period)
    const timeout = setTimeout(() => {
      this.typingUsers.delete(key);
    }, this.configService.chatTypingInactivityMs);

    this.typingUsers.set(key, {
      userId,
      consultationId,
      userName,
      timeout,
    });
  }

  setUserStoppedTyping(userId: number, consultationId: number): void {
    const key = `${userId}-${consultationId}`;
    const existing = this.typingUsers.get(key);

    if (existing?.timeout) {
      clearTimeout(existing.timeout);
    }

    this.typingUsers.delete(key);
  }

  getTypingUsers(consultationId: number): Array<{ userId: number; userName: string }> {
    return Array.from(this.typingUsers.values())
      .filter(user => user.consultationId === consultationId)
      .map(user => ({ userId: user.userId, userName: user.userName }));
  }

  async deleteMessage(
    messageId: number,
    userId: number,
    consultationId: number,
  ) {
    try {
      const message = await this.prisma.message.findFirst({
        where: {
          id: messageId,
          userId,
          consultationId,
        },
      });

      if (!message) {
        throw HttpExceptionHelper.notFound('Message not found or access denied');
      }

      // Soft delete by updating content
      const updatedMessage = await this.prisma.message.update({
        where: { id: messageId },
        data: {
          content: '[Message deleted]',
          editedAt: new Date(),
          mediaUrl: null,
          mediaType: null,
        },
      });

      this.logger.log(`Message deleted: ID ${messageId}, User ${userId}`);

      return updatedMessage;
    } catch (error) {
      this.logger.error('Failed to delete message:', error);
      throw error;
    }
  }

  async editMessage(
    messageId: number,
    userId: number,
    newContent: string,
    consultationId: number,
  ) {
    try {
      const message = await this.prisma.message.findFirst({
        where: {
          id: messageId,
          userId,
          consultationId,
        },
      });

      if (!message) {
        throw HttpExceptionHelper.notFound('Message not found or access denied');
      }

      // Check if message is too old to edit (configurable timeout)
      const editTimeoutMs = this.configService.chatMessageEditTimeoutMinutes * 60 * 1000;
      const editDeadline = new Date(Date.now() - editTimeoutMs);
      if (message.createdAt < editDeadline) {
        throw HttpExceptionHelper.badRequest(`Message is too old to edit (limit: ${this.configService.chatMessageEditTimeoutMinutes} minutes)`);
      }

      const updatedMessage = await this.prisma.message.update({
        where: { id: messageId },
        data: {
          content: newContent,
          editedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          readReceipts: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      this.logger.log(`Message edited: ID ${messageId}, User ${userId}`);

      return updatedMessage;
    } catch (error) {
      this.logger.error('Failed to edit message:', error);
      throw error;
    }
  }

  private async verifyConsultationAccess(
    userId: number,
    consultationId: number,
  ) {
    const participant = await this.prisma.participant.findUnique({
      where: {
        consultationId_userId: { consultationId, userId },
      },
    });

    if (!participant) {
      throw HttpExceptionHelper.badRequest('User does not have access to this consultation');
    }

    return participant;
  }

  private validateFile(file: Express.Multer.File) {
    const maxSize = this.configService.maxFileUploadSizeBytes;
    const allowedTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',

      // Documents
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/csv',
      'application/rtf',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4',
      'audio/webm',
      'video/mp4',
      'video/webm',
      'video/ogg',
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/dicom',
      'text/xml',
      'application/xml',
      'application/json'
    ];

    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      throw HttpExceptionHelper.badRequest(`File size too large. Maximum size is ${maxSizeMB}MB.`);
    }

    if (!allowedTypes.includes(file.mimetype)) {
      throw HttpExceptionHelper.badRequest(`File type '${file.mimetype}' not allowed. Supported types: images, documents, audio, video, and archives.`);
    }

    this.validateFileSpecificRules(file);
  }

  private validateFileSpecificRules(file: Express.Multer.File) {
    if (file.mimetype.startsWith('video/')) {
      const videoMaxSize = Math.min(this.configService.maxFileUploadSizeBytes, 50 * 1024 * 1024);
      if (file.size > videoMaxSize) {
        throw HttpExceptionHelper.badRequest(`Video files cannot exceed ${Math.round(videoMaxSize / (1024 * 1024))}MB`);
      }
    }

    if (file.mimetype.startsWith('audio/')) {
      const audioMaxSize = Math.min(this.configService.maxFileUploadSizeBytes, 25 * 1024 * 1024);
      if (file.size > audioMaxSize) {
        throw HttpExceptionHelper.badRequest(`Audio files cannot exceed ${Math.round(audioMaxSize / (1024 * 1024))}MB`);
      }
    }

    // Medical DICOM files might be larger
    if (file.mimetype === 'application/dicom') {
      const dicomMaxSize = Math.min(this.configService.maxFileUploadSizeBytes, 100 * 1024 * 1024); // 100MB max for DICOM
      if (file.size > dicomMaxSize) {
        throw HttpExceptionHelper.badRequest(`DICOM files cannot exceed ${Math.round(dicomMaxSize / (1024 * 1024))}MB`);
      }
    }
  }

  private determineMessageType(mimetype: string): MessageType {
    if (mimetype.startsWith('image/')) {
      return MessageType.IMAGE;
    } else {
      return MessageType.FILE;
    }
  }

  /**
   * Generate rich file metadata for frontend consumption
   */
  generateFileMetadata(file: { fileName: string; fileSize: number; mediaType: string; mediaUrl: string }) {
    const metadata = {
      fileName: file.fileName,
      fileSize: file.fileSize,
      mediaType: file.mediaType,
      mediaUrl: file.mediaUrl,
      isImage: file.mediaType?.startsWith('image/'),
      isVideo: file.mediaType?.startsWith('video/'),
      isAudio: file.mediaType?.startsWith('audio/'),
      isPdf: file.mediaType === 'application/pdf',
      isDocument: this.isDocumentType(file.mediaType),
      canPreview: this.canPreviewFile(file.mediaType),
      fileSizeFormatted: this.formatFileSize(file.fileSize),
      fileExtension: this.getFileExtension(file.fileName),
      iconType: this.getFileIconType(file.mediaType)
    };

    return metadata;
  }

  private isDocumentType(mimeType: string): boolean {
    const documentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ];
    return documentTypes.includes(mimeType);
  }

  private canPreviewFile(mimeType: string): boolean {
    return mimeType?.startsWith('image/') ||
      mimeType === 'application/pdf' ||
      mimeType === 'text/plain';
  }

  private formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private getFileExtension(fileName: string): string {
    return fileName ? fileName.split('.').pop()?.toLowerCase() || '' : '';
  }

  private getFileIconType(mimeType: string): string {
    if (mimeType?.startsWith('image/')) return 'image';
    if (mimeType?.startsWith('video/')) return 'video';
    if (mimeType?.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType?.includes('word') || mimeType?.includes('document')) return 'word';
    if (mimeType?.includes('excel') || mimeType?.includes('sheet')) return 'excel';
    if (mimeType?.includes('powerpoint') || mimeType?.includes('presentation')) return 'powerpoint';
    if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('7z')) return 'archive';
    return 'file';
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { ApprovalStatus, Category } from '@prisma/client';



export class CreateWhatsappTemplateDto {
  @ApiProperty({
    description: 'Template SID from WhatsApp',
    example: 'HX1234567890abcdef',
    required: false,
  })
  sid?: string;

  @ApiProperty({
    description: 'Friendly name for the template',
    example: 'Welcome Message Template',
  })
  friendlyName: string;

  @ApiProperty({
    description: 'Language code for the template',
    example: 'en_US',
  })
  language: string;

  @ApiProperty({
    description: 'Unique key for the template',
    example: 'welcome_message_v1',
    required: false,
  })
  key?: string;

  @ApiProperty({
    description: 'Template category',
    enum: Category,
    example: Category.UTILITY,
    required: false,
  })
  category?: Category;

  @ApiProperty({
    description: 'Content type of the template',
    example: 'text',
    required: false,
  })
  contentType?: string;

  @ApiProperty({
    description: 'Template variables as JSON object',
    example: { name: 'string', date: 'datetime' },
    required: false,
  })
  variables?: Record<string, any>;

  @ApiProperty({
    description: 'Variable types as JSON object',
    example: { name: 'TEXT', date: 'DATE_TIME' },
    required: false,
  })
  types?: Record<string, any>;

  @ApiProperty({
    description: 'Template URL if applicable',
    example: 'https://example.com/template',
    required: false,
  })
  url?: string;

  @ApiProperty({
    description: 'Template actions as JSON object',
    example: { buttons: [{ type: 'URL', text: 'Visit Website' }] },
    required: false,
  })
  actions?: Record<string, any>;

  @ApiProperty({
    description: 'Template approval status',
    enum: ApprovalStatus,
    example: ApprovalStatus.DRAFT,
    required: false,
  })
  approvalStatus?: ApprovalStatus;

  @ApiProperty({
    description: 'Rejection reason if template was rejected',
    example: 'Template content violates WhatsApp policy',
    required: false,
  })
  rejectionReason?: string;
}
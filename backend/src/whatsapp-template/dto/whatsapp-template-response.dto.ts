import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WhatsappTemplateResponseDto {
  @ApiProperty({ description: 'Template ID' })
  @Expose()
  id: number;

  @ApiPropertyOptional({ description: 'Template SID from WhatsApp' })
  @Expose()
  sid?: string;

  @ApiProperty({ description: 'Human-readable template name' })
  @Expose()
  friendlyName: string;

  @ApiProperty({ description: 'Template language code' })
  @Expose()
  language: string;

  @ApiPropertyOptional({ description: 'Unique template key' })
  @Expose()
  key?: string;

  @ApiPropertyOptional({ description: 'Template category' })
  @Expose()
  category?: string;

  @ApiPropertyOptional({ description: 'Content type of the template' })
  @Expose()
  contentType?: string;

  @ApiPropertyOptional({ description: 'Template variables' })
  @Expose()
  variables?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Variable types definition' })
  @Expose()
  types?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Template URL if applicable' })
  @Expose()
  url?: string;

  @ApiPropertyOptional({ description: 'Template actions configuration' })
  @Expose()
  actions?: Record<string, any>;

  @ApiProperty({ description: 'Template approval status' })
  @Expose()
  approvalStatus: string;

  @ApiPropertyOptional({ description: 'Rejection reason if rejected' })
  @Expose()
  rejectionReason?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  @Transform(({ value }) => value?.toISOString())
  createdAt: string;

  @ApiProperty({ description: 'Update timestamp' })
  @Expose()
  @Transform(({ value }) => value?.toISOString())
  updatedAt: string;
}

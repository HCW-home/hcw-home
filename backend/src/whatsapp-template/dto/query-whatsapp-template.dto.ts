import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryWhatsappTemplateDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Search term for friendlyName or key' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by category',
    enum: ['UTILITY', 'MARKETING', 'AUTHENTICATION']
  })
  @IsOptional()
  @IsIn(['UTILITY', 'MARKETING', 'AUTHENTICATION'])
  category?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by approval status',
    enum: ['pending', 'approved', 'rejected', 'draft', 'unknown', 'received']
  })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'draft', 'unknown', 'received'])
  approvalStatus?: string;

  @ApiPropertyOptional({ description: 'Filter by language' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ 
    description: 'Sort field',
    enum: ['id', 'friendlyName', 'language', 'category', 'approvalStatus', 'createdAt', 'updatedAt']
  })
  @IsOptional()
  @IsIn(['id', 'friendlyName', 'language', 'category', 'approvalStatus', 'createdAt', 'updatedAt'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ 
    description: 'Sort order',
    enum: ['asc', 'desc']
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
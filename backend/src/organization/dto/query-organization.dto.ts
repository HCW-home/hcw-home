import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class QueryOrganizationDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    default: 1,
    required: false,
  })
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 10;

  @ApiProperty({
    description: 'Search term for organization name',
    example: 'Healthcare',
    required: false,
  })
  search?: string;

  @ApiProperty({
    description: 'Field to sort by',
    example: 'name',
    enum: ['id', 'name', 'createdAt', 'updatedAt'],
    default: 'createdAt',
    required: false,
  })
  sortBy?: 'id' | 'name' | 'createdAt' | 'updatedAt' = 'createdAt';

  @ApiProperty({
    description: 'Sort order',
    example: 'desc',
    enum: ['asc', 'desc'],
    default: 'desc',
    required: false,
  })
  sortOrder?: 'asc' | 'desc' = 'desc';
}

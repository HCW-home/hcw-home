import { ApiProperty } from '@nestjs/swagger';

export class QueryGroupDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
    type: 'integer',
    minimum: 1,
    default: 1,
  })
  page?: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  limit?: number;

  @ApiProperty({
    description: 'Search term to filter groups by name or description',
    example: 'cardiology',
    required: false,
    maxLength: 100,
  })
  search?: string;

  @ApiProperty({
    description: 'Field to sort by',
    example: 'name',
    required: false,
    enum: ['id', 'name', 'createdAt', 'updatedAt'],
    default: 'createdAt',
  })
  sortBy?: 'id' | 'name' | 'createdAt' | 'updatedAt';

  @ApiProperty({
    description: 'Sort order',
    example: 'asc',
    required: false,
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  sortOrder?: 'asc' | 'desc';
}

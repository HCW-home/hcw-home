import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class BulkImportResultDto {
  @ApiProperty({ description: 'Number of templates created' })
  @Expose()
  created: number;

  @ApiProperty({ description: 'Number of templates updated' })
  @Expose()
  updated: number;

  @ApiProperty({ description: 'Number of templates skipped' })
  @Expose()
  skipped: number;

  @ApiProperty({ description: 'Total templates processed' })
  @Expose()
  total: number;

  @ApiProperty({ description: 'Import summary details' })
  @Expose()
  details: string[];

  constructor(partial: Partial<BulkImportResultDto>) {
    Object.assign(this, partial);
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class OrganizationResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier for the organization',
    example: 1,
  })
  id: number;

  @Expose()
  @ApiProperty({
    description: 'Name of the organization',
    example: 'Healthcare Plus',
  })
  name: string;

  @Expose()
  @ApiProperty({
    description: 'Logo URL for the organization',
    example: 'https://example.com/logo.png',
    nullable: true,
  })
  logo: string | null;

  @Expose()
  @ApiProperty({
    description: 'Primary color for branding',
    example: '#007bff',
    nullable: true,
  })
  primaryColor: string | null;

  @Expose()
  @ApiProperty({
    description: 'Footer content in markdown format',
    example: '## Contact Us\n\nEmail: info@healthcareplus.com',
    nullable: true,
  })
  footerMarkdown: string | null;

  @Expose()
  @ApiProperty({
    description: 'Organization creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @Expose()
  @ApiProperty({
    description: 'Organization last update timestamp',
    example: '2024-01-20T14:45:00.000Z',
  })
  updatedAt: Date;
}

import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Name of the organization',
    example: 'Healthcare Plus',
    minLength: 2,
    maxLength: 100,
  })
  name: string;

  @ApiProperty({
    description: 'Logo URL for the organization',
    example: 'https://example.com/logo.png',
    required: false,
  })
  logo?: string;

  @ApiProperty({
    description: 'Primary color for branding (hex code)',
    example: '#007bff',
    pattern: '^#[0-9A-Fa-f]{6}$',
    required: false,
  })
  primaryColor?: string;

  @ApiProperty({
    description: 'Footer content in markdown format',
    example: '## Contact Us\n\nEmail: info@healthcareplus.com',
    required: false,
  })
  footerMarkdown?: string;
}

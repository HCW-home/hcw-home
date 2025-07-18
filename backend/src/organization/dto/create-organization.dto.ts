import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsHexColor,
  Length,
  Matches,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Name of the organization',
    example: 'Healthcare Plus',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    description: 'Logo URL for the organization',
    example: 'https://example.com/logo.png',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUrl()
  logo?: string;

  @ApiProperty({
    description: 'Primary color for branding (hex code)',
    example: '#007bff',
    pattern: '^#[0-9A-Fa-f]{6}$',
    required: false,
  })
  @IsOptional()
  primaryColor?: string;

  @ApiProperty({
    description: 'Footer content in markdown format',
    example: '## Contact Us\n\nEmail: info@healthcareplus.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  footerMarkdown?: string;
}

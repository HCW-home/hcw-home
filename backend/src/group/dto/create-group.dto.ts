import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';


export class CreateGroupDto {
  @ApiProperty({
    description: 'Name of the group',
    example: 'Medical Team Alpha',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Description of the group and its purpose',
    example:
      'A specialized group for cardiology consultations and patient care coordination',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Whether the group shares only incoming consultations with members',
    example: true,
    required: false,
    default: false,
  })
  @IsOptional()
  sharedOnlyIncomingConsultation?: boolean;
}

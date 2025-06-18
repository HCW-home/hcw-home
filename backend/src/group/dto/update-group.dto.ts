import { ApiProperty } from '@nestjs/swagger';

export class UpdateGroupDto {
  @ApiProperty({
    description: 'Name of the group',
    example: 'Medical Team Alpha',
    required: false,
    minLength: 2,
    maxLength: 100,
  })
  name?: string;

  @ApiProperty({
    description: 'Description of the group and its purpose',
    example:
      'A specialized group for cardiology consultations and patient care coordination',
    required: false,
    maxLength: 500,
  })
  description?: string;

  @ApiProperty({
    description:
      'Whether the group shares only incoming consultations with members',
    example: true,
    required: false,
  })
  sharedOnlyIncomingConsultation?: boolean;
}

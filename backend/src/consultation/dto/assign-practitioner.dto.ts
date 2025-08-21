import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class AssignPractitionerDto {
  @ApiProperty({ example: 123, description: 'Practitioner User ID' })
  @IsInt()
  @Min(1)
  practitionerId: number;
}

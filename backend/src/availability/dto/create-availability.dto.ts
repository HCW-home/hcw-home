import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsBoolean,
  Min,
  Max,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class CreateAvailabilityDto {
  @ApiProperty({ required: false, description: 'Will be auto-populated from authenticated user' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? value : parsed;
    }
    return value;
  })
  practitionerId?: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => typeof value === 'string' ? parseInt(value, 10) : value)
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  startTime: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  endTime: string;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => typeof value === 'string' ? parseInt(value, 10) : value)
  @Min(15)
  @Max(120)
  slotDuration: number = 30;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value === true;
  })
  isActive?: boolean = true;
}

import { IsString } from 'class-validator';

export class CreateSpecialityDto {
  @IsString()
  name: string;
}
import { IsInt, IsString } from 'class-validator';

export class GetSpecialityDto {
  @IsInt()
  id: number;

  @IsString()
  name: string;
}
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOrganisationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  footerMarkdown?: string;
}
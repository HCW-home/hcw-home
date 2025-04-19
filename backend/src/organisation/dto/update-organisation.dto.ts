import { IsOptional, IsString } from 'class-validator';

export class UpdateOrganisationDto {
  @IsOptional()
  @IsString()
  name?: string;

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

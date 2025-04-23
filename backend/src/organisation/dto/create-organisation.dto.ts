import { IsString, IsNotEmpty } from 'class-validator';

export class CreateOrganisationDto  {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  logo: string;

  @IsString()
  primaryColor: string;

  @IsString()
  footerMarkdown: string;
}

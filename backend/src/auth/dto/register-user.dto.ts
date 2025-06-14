import { ApiProperty } from '@nestjs/swagger';
export class RegisterUserDto {
  @ApiProperty({ description: 'First name', minLength: 2, maxLength: 50 })
  firstName: string;

  @ApiProperty({ description: 'Last name', minLength: 2, maxLength: 50 })
  lastName: string;

  @ApiProperty({ description: 'Email address', format: 'email' })
  email: string;

  @ApiProperty({ description: 'Password', minLength: 8, maxLength: 100 })
  password: string;
}

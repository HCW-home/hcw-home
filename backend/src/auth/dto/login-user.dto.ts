import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from 'src/user/dto/user-response.dto';
import { TokenDto } from './token.dto';

export class LoginUserDto {
  @ApiProperty({ description: 'Email address', format: 'email' })
  email: string;

  @ApiProperty({ description: 'Password', minLength: 8, maxLength: 100 })
  password: string;


  @ApiProperty({ description: 'role',})
  role : string

  constructor(partial: Partial<LoginUserDto>) {
    Object.assign(this, partial);
  }
}

export class LoginResponseDto {
  @ApiProperty({ description: 'tokens for authenticated user' })
   tokens:TokenDto

  @ApiProperty({ description: 'User data' })
  user:UserResponseDto

  constructor(partial: Partial<LoginResponseDto>) {
    Object.assign(this, partial);
  }
}







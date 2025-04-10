import { Controller, Post, UseGuards, Request, HttpStatus,HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { PassportLocalGuard } from './guards/passport-local.guard';
@Controller('auth-v2')
export class PassportAuthController {
  constructor(private readonly authService: AuthService) {}
   

  @HttpCode(HttpStatus.OK)
  @UseGuards(PassportLocalGuard)
  @Post('login')
   login(@Request() Request) {
    return this.authService.login(Request.user )
  }
}

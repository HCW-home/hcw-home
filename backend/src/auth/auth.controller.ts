import { Controller, HttpCode, HttpStatus, NotAcceptableException, Post, Body, NotImplementedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor (private readonly authService:AuthService){}
  
    @Post('login')
    login(@Body() body: { username: string; password: string }) {
        const {username,password}= body;
        return this.authService.login(username,password);
      
    }
  
    // @Post('logout')
    // logout() {
    //   return this.authService.logout();
    // }
}

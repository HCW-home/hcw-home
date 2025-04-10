import { Controller, HttpCode, HttpStatus, NotAcceptableException, Post, Body, NotImplementedException,Get,UseGuards,Req,Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';

@Controller('auth')
export class AuthController {
    constructor (private readonly authService:AuthService){}


    @HttpCode(HttpStatus.OK)
    @Post('login')
    login(@Body() body: { username: string; password: string }) {
      const { username, password } = body;
      return this.authService.login({ email: username, password });
    }
    
    @UseGuards(AuthGuard)
    @Get('me')
    getUserInfo(@Request() req: Request) {
      const user = (req as any).user
      return user
    }
    
}

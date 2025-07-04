import {
  Controller,
  Post,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Body,
  Query,
  Res,
  Logger,
  Next,
  Param,
  HttpException,
  ValidationPipe
} from '@nestjs/common';
import * as passport from 'passport';
import { AuthService } from './auth.service';
import { PassportLocalGuard } from './guards/passport-local.guard';
import { LoginResponseDto, LoginUserDto } from './dto/login-user.dto';
import { ExtendedRequest } from 'src/types/request';
import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from './enums/role.enum';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { RegisterUserDto } from './dto/register-user.dto';
import { UserResponseDto } from 'src/user/dto/user-response.dto';
import { ApiResponse, ApiOperation,ApiQuery } from '@nestjs/swagger';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { RefreshTokenDto, TokenDto } from './dto/token.dto';
import { registerUserSchema } from './validation/auth.validation';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { Request, Response } from 'express';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { CustomLoggerService } from 'src/logger/logger.service';

@Controller('auth')
export class AuthController {

  constructor(
  private readonly authService: AuthService,
   private readonly logger: CustomLoggerService
  ) {
  logger.setContext('Authcontroller')
  }

  // login user
  @ApiOperation({ summary: 'Login a user' })
  @ApiResponse({
    status: 200,
    description: 'User logged-in successfully',
    type: LoginResponseDto,
  })
  @UseGuards(PassportLocalGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login-local')   
  async login(
    @Req() req: ExtendedRequest,
  ): Promise<ApiResponseDto<LoginResponseDto>> {
    const user = req.user as any;
    this.logger.log(`user attached to the request: ${user}`)    
    const result = await this.authService.loginUser(user);
    return ApiResponseDto.success(result, 'User logged-in successfully', 200);
  }

  @Get('session')
  @UseGuards(AuthenticatedGuard) 
  getSession(@Req() req: Request) {
    if (req.user) {
      return {
        success: true,
        message: 'Session user data',
        user: req.user,
      };
    } else {
      return {
        success: false,
        message: 'No session user found',
      };
    }
  }

  @Get('openid/login') // e.g., /api/v1/auth/oidc/login?role=admin
  @ApiOperation({ summary: 'Initiate OpenID login' })
  @ApiQuery({ name: 'role', required: true, type: String, example: 'admin' })
  loginOidc(@Req() req: Request, @Res() res: Response) {
    const { role } = req.query;
    const Reqrole = (role as string)?.toUpperCase() as Role;

    if (!Reqrole || !(Reqrole in Role)) {
      this.logger.warn('Invalid or missing role in login URL');
      throw HttpExceptionHelper.badRequest('Missing or invalid role in query param');
    }

    this.logger.log(`Login request for ${Reqrole}`);

    const strategyMap = {
      [Role.ADMIN]: 'openidconnect_admin',
      [Role.PRACTITIONER]: 'openidconnect_practitioner',
    };
  
    const strategy = strategyMap[Reqrole];
  
    return passport.authenticate(strategy, {
      scope: ['openid', 'profile', 'email'],
    })(req, res, (err) => {
      if (err) {
        this.logger.error('Passport middleware failed during login', err);
        throw HttpExceptionHelper.internalServerError("Passport login failed");
      }
    });
  }
  
  

@Get('callback/:provider') // Example: /api/v1/auth/callback/:{}?role
async oidcCallback(
  @Req() req: Request,
  @Param('provider') provider: string,
  @Res() res:Response
): Promise<any> {
  const { role } = req.query;
  const ReqRole = (role as string)?.toUpperCase() as Role;

  if (!ReqRole || !(ReqRole in Role)) {
    this.logger.warn(`Missing or invalid role in callback`);
    throw HttpExceptionHelper.badRequest('Missing or invalid role in query param');
  }


  const strategyMap = {
    [Role.ADMIN]: 'openidconnect_admin',
    [Role.PRACTITIONER]: 'openidconnect_practitioner',
  };

  const redirectMap = {
    [Role.ADMIN]: process.env.ADMIN_URL,
    [Role.PRACTITIONER]: process.env.PRACTITIONER_URL,
  };
  const strategy = strategyMap[ReqRole];
  const redirectTo = redirectMap[ReqRole];


  return new Promise((resolve) => {
    passport.authenticate(strategy, async (err, user, info) => {
      if (err) {
        return resolve({
          success: false,
          message: 'Authentication failed',
          error: err.message || err,
        });
      }

      if (!user) {
        return resolve({
          success: false,
          message: 'No user info returned',
        });
      }

      const tokens= user.data.tokens
      const finalRedirect = `${redirectTo}/login?aT=${tokens.accessToken}&rT=${tokens.refreshToken}`;
      this.logger.log(`Redirecting ${ReqRole} to ${finalRedirect}`);
      // return resolve(user)
      return resolve(res.redirect(finalRedirect)); // redirect to frontend with tokens
    })(req, null as any, (authErr) => {
      if (authErr) {
        return resolve({
          success: false,
          message: 'Internal error during authentication',
          error: authErr.message || authErr,
        });
      }
    });
  });
}

  

  // register pateint
  @ApiOperation({ summary: 'Register a user' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: CreateUserDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 409, description: 'Conflict - email already exists' })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerUserSchema))
    registerDto: RegisterUserDto,
    @Req() req: ExtendedRequest,
  ) {
    const user = await this.authService.registerUser(registerDto);

    return ApiResponseDto.success(user, 'User registered successfully', 201);
  }

  // get the current user
  @ApiOperation({ summary: 'Get the user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrive successfully',
    type: UserResponseDto,
  })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PATIENT, Role.PRACTITIONER)
  @HttpCode(HttpStatus.OK)
  @Get('me')
  async getMe(
    @Req() req: ExtendedRequest,
  ): Promise<ApiResponseDto<UserResponseDto>> {
    if(!req.user){
      throw HttpExceptionHelper.unauthorized("user not logged id/token experied")
    }
    const user = req.user;
    this.logger.log(`user with email: ${user.email} retrieved successfully`);
    return ApiResponseDto.success(user, 'User retrieved successfully', 200);
  }

  // get a new access token
  @ApiOperation({ summary: 'Get a new access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrive successfully',
    type: LoginResponseDto,
  })
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body(new ValidationPipe({transform: true}),) refreshTokenDto: RefreshTokenDto,
  ): Promise<ApiResponseDto<any>> {    
    this.logger.log('refresh token called')
    if (!refreshTokenDto.refreshToken) {
      throw HttpExceptionHelper.badRequest('Refresh token is required');
    }
  
    const result = await this.authService.refreshToken(refreshTokenDto);
    return ApiResponseDto.success(result, 'Tokens created successfully', 200);
  }
  
}

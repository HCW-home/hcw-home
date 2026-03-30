import {
  Controller,
  Post,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Body,
  Res,
  Param,
  HttpException,
  ValidationPipe,
} from '@nestjs/common';
import passport from 'passport';
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
import { ApiResponse, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { RefreshTokenDto, TokenDto } from './dto/token.dto';
import { registerUserSchema } from './validation/auth.validation';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { Request, Response } from 'express';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { CustomLoggerService } from 'src/logger/logger.service';
import { TokenType } from '@prisma/client';
import { MagicLinkGuard } from './guards/magic-link.guard';
import { updatePasswordSchema, updateUserSchema } from 'src/user/validation/user.validation';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';
import { MagicLinkLoginDto } from './dto/magic-link-login.dto';
import { EmailService } from 'src/common/email/email.service';


@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly logger: CustomLoggerService,
    private readonly emailService: EmailService,

  ) {
    logger.setContext('Authcontroller');
  }

  @Post('login/magic-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with a magic link token' })
  @ApiResponse({
    status: 200,
    description: 'Successfully logged in',
    type: TokenDto,
  })
  async loginWithMagicLink(
    @Body() magicLinkLoginDto: MagicLinkLoginDto,
  ): Promise<ApiResponseDto<TokenDto>> {
    const tokens = await this.authService.loginWithMagicLink(
      magicLinkLoginDto.token,
    );
    return ApiResponseDto.success(tokens, 'Successfully logged in', 200);
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
  async login(@Req() req: ExtendedRequest): Promise<ApiResponseDto<TokenDto>> {
    const user = req.user as any;
    this.logger.log(`user attached to the request: ${user}`);
    const result = await this.authService.loginUser(user.id);
    return ApiResponseDto.success(result, 'User logged-in successfully', 200);
  }

  @UseGuards(MagicLinkGuard)
  @Post('magic-login')
  async loginWithMagic(
    @Req() req: ExtendedRequest,
  ): Promise<ApiResponseDto<TokenDto>> {
    this.logger.log('Magic login request received');
    this.logger.debug(`Request body: ${JSON.stringify(req.body)}`);

    const user = req.user as any;

    this.logger.debug(`req.user raw: ${JSON.stringify(user)}`);

    if (!user) {
      this.logger.warn('No user attached to request (req.user is falsy)');
      throw HttpExceptionHelper.unauthorized('Authentication failed: no user');
    }
    if (typeof user.id === 'undefined' || user.id === null) {
      this.logger.error(
        'req.user.id is missing or undefined',
        JSON.stringify(user),
      );
      throw HttpExceptionHelper.unauthorized(
        'Authentication failed: user id missing',
      );
    }

    try {
      this.logger.log(`Logging in user id=${user.id}`);
      const result = await this.authService.loginUser(user.id);
      this.logger.debug(`loginUser result: ${JSON.stringify(result)}`);
      return ApiResponseDto.success(result, 'User logged-in successfully', 200);
    } catch (err) {
      this.logger.error('Error in loginWithMagic', err?.message ?? err, {
        user,
      });
      throw err;
    }
  }

  @UseGuards(AuthGuard)
  @Post('update')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Conflict - email already exists' })
  async update(
    @Body(new ZodValidationPipe(updateUserSchema)) updateUserDto: UpdateUserDto,
    @Req() req: ExtendedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      this.logger.error('User ID not found in request');
      throw HttpExceptionHelper.unauthorized('User ID not found');
    }
    const user = await this.authService.update(userId, updateUserDto);
    return ApiResponseDto.success(user, 'User updated successfully', 200);
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
      throw HttpExceptionHelper.badRequest(
        'Missing or invalid role in query param',
      );
    }

    this.logger.log(`Login request for ${Reqrole}`);

    const strategyMap = {
      [Role.ADMIN]: 'openidconnect_admin',
      [Role.PRACTITIONER]: 'openidconnect_practitioner',
    };

    const strategy = strategyMap[Reqrole];

    try {
      return passport.authenticate(strategy, {
        scope: ['openid', 'profile', 'email'],
      })(req, res);
    } catch (error) {
      this.logger.error('OIDC authenticate() failed', error.stack);
      throw HttpExceptionHelper.internalServerError(
        'OIDC authenticate() failed',
      );
    }
  }

  @Get('callback/:provider')
  async oidcCallback(
    @Req() req: Request,
    @Param('provider') provider: string,
    @Res() res: Response,
  ): Promise<void> {
    const { role } = req.query;
    const ReqRole = (role as string)?.toUpperCase() as Role;

    if (!ReqRole || !(ReqRole in Role)) {
      this.logger.warn(`Missing or invalid role in callback`);
      return res.redirect(`/login?error=InvalidRole`);
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

    try {
      passport.authenticate(strategy, async (err, user, info) => {
        if (res.headersSent) return;

        if (err) {
          this.logger.error(`OIDC error: ${err.message || err}`);
          return res.redirect(
            `${redirectTo}/login?error=${encodeURIComponent(err.message || 'OIDCError')}`,
          );
        }
        const data = user as LoginResponseDto;
        if (!data || !data.user || !data.tokens) {
          this.logger.warn('User data or tokens not found in OIDC callback');
          return res.redirect(`${redirectTo}/login?error=UserDataNotFound`);
        }
        const { accessToken, refreshToken } = data.tokens;
        if (
          data.user.password &&
          data.user.password.startsWith('temp') &&
          ReqRole === Role.PRACTITIONER
        ) {
          this.logger.log(`Redirecting to set-password for user ${data.user.email}`);

          const finalRedirect = `${redirectTo}/login?mode=set-password&email=${encodeURIComponent(
            data.user.email
          )}&aT=${accessToken}&rT=${refreshToken}`;
          return res.redirect(finalRedirect);
        }

        const finalRedirect = `${redirectTo}/login?aT=${accessToken}&rT=${refreshToken}`;
        this.logger.log(`Redirecting to ${finalRedirect}`);
        return res.redirect(finalRedirect);
      })(req, res);
    } catch (e) {
      if (!res.headersSent) {
        return res.redirect(`${redirectTo}/login?error=Unexpected`);
      }
    }
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
    if (!req.user) {
      throw HttpExceptionHelper.unauthorized(
        'user not logged id/token experied',
      );
    }

    const user = await this.authService.getcurrentuser(req.user?.id);
    // this.logger.log(`user with email: ${user.email} retrieved successfully`);
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
    @Body(new ValidationPipe({ transform: true }))
    refreshTokenDto: RefreshTokenDto,
  ): Promise<ApiResponseDto<any>> {
    this.logger.log('refresh token called');
    if (!refreshTokenDto.refreshToken) {
      throw HttpExceptionHelper.badRequest('Refresh token is required');
    }

    const result = await this.authService.refreshToken(refreshTokenDto);
    return ApiResponseDto.success(result, 'Tokens created successfully', 200);
  }

  @Post('update-password')
  async resetPassword(
    @Body(new ZodValidationPipe(updatePasswordSchema))
    body: { username: string; password: string },
    @Req() req: ExtendedRequest,
  ) {
    const { username, password } = body;
    if (!username || !password) {
      throw new HttpException(
        'Email and password are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.authService.updatePassword(username, password);
    return ApiResponseDto.success({}, 'Password updated successfully', 200);
  }

  @Post('request-magic-link')
  async requestMagicLink(
    @Body('contact') contact: string,
    @Body('type') type: TokenType = 'login', // default to 'login'
  ) {
    const { token, user } = await this.authService.generateMagicToken(
      contact,
      type,
    );
    const pateintUrl = process.env.PATIENT_URL;

    const magicLink = `${pateintUrl}/login?token=${token}`;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    this.logger.log(`magic link: ${magicLink}`);


    if (isEmail) {
      await this.emailService.sendSelfInvitationEmail(contact, magicLink);
      this.logger.log(`Magic link email sent to ${contact}`, { magicLink });
    } else {
      this.logger.log(`Magic link created but not sent (not an email)`, {
        contact,
        magicLink,
      });
    }

    this.logger.log(`magic link created and sent`, { magicLink });

    return {
      message: `Magic link sent to ${contact}`,
      contact,
    };
  }
}

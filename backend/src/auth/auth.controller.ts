import {
  Controller,
  Post,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  Body,
  Logger,
} from '@nestjs/common';
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
import { ApiResponse, ApiOperation } from '@nestjs/swagger';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { RefreshTokenDto, TokenDto } from './dto/token.dto';
import { registerUserSchema } from './validation/auth.validation';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  // login user
  @ApiOperation({ summary: 'Login a user' })
  @ApiResponse({
    status: 200,
    description: 'User logged-in successfully',
    type: LoginResponseDto,
  })
  @UseGuards(PassportLocalGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Req() req: ExtendedRequest,
    @Body() LoginDto: LoginUserDto,
  ): Promise<ApiResponseDto<LoginResponseDto>> {
    const user = req.user as any;
    const result = await this.authService.loginUser(user);
    return ApiResponseDto.success(result, 'User logged-in successfully', 200);
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
    const requestId = req.id as string;
    const userEmail = req.user?.email as string;
    const user = await this.authService.findByEmail(userEmail);
    this.logger.log(`user ${user.id} started retrieving`);
    if (!user) {
      this.logger.warn(`${user.id}:User not found`);
      throw HttpExceptionHelper.notFound('user not found', requestId, req.url);
    }
    this.logger.log(`user ${user.id} retrieved successfully`);
    this.logger.log(`user ${user.id} role is ${user.role}`);
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
    @Body() refreshToken: RefreshTokenDto,
    @Req() req: ExtendedRequest,
  ) {
    const requestId = req.id as string;
    if (!refreshToken) {
      throw HttpExceptionHelper.badRequest('Refresh token is required');
    }
    const result = await this.authService.refreshToken(refreshToken);
    return ApiResponseDto.success(result, 'tokens created successfully', 200);
  }
}

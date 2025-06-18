import { Injectable, Logger } from '@nestjs/common';
import { LoginResponseDto, LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { UserResponseDto } from 'src/user/dto/user-response.dto';
import { Role } from './enums/role.enum';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { TokenDto } from './dto/token.dto';
import { DatabaseService } from 'src/database/database.service';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly JwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  async validateUser(
    loginUserDto: LoginUserDto,
    requestId: string,
    path: string,
  ): Promise<{ userId: number; userEmail: string }> {
    const user = await this.findByEmail(loginUserDto.email);

    if (!user || user.temporaryAccount) {
      this.logger.warn(
        `LocalStrategy: No valid user found for email ${user.email}`,
      );
      throw HttpExceptionHelper.notFound('user not found/user not valid');
    }
    if (user.status !== UserStatus.APPROVED) {
      this.logger.warn(`LocalStrategy: User ${user.id} is not approved`);
      throw HttpExceptionHelper.badRequest('user is not approved');
    }
    const passwordMatch = await bcrypt.compare(
      loginUserDto.password,
      user.password,
    );

    if (!passwordMatch) {
      this.logger.warn(`LocalStrategy: Incorrect password for user ${user.id}`);
      throw HttpExceptionHelper.unauthorized('password or email is incorrect');
    }
    return {
      userId: user.id,
      userEmail: user.email,
    };
  }

  async loginUser(UserResponseDto: UserResponseDto): Promise<LoginResponseDto> {
    const result = await this.generateToken(UserResponseDto);
    return result;
  }

  async generateToken(user: UserResponseDto): Promise<LoginResponseDto> {
    this.logger.log(`Generating JWT tokens for user ${user.id}`);
    const accessToken = this.JwtService.sign(
      { userId: user.id, userEmail: user.email },
      {
        secret: await this.configService.get<string>('jwt.accessSecret'),
        expiresIn:
          (await this.configService.get<string>('jwt.accessExpiresIn')) ||
          '24h',
      },
    );
    this.logger.log(`Access token generated successfully for user ${user.id}`);

    const refreshToken = this.JwtService.sign(
      { userId: user.id, userEmail: user.email },
      {
        secret: await this.configService.get<string>('jwt.refreshSecret'),
        expiresIn:
          (await this.configService.get<string>('jwt.refreshExpiresIn')) ||
          '7d',
      },
    );

    this.logger.log(`Refresh token generated successfully for user ${user.id}`);

    return { accessToken, refreshToken, userId: user.id, email: user.email };
  }

  async verifyToken(
    tokenDto: TokenDto,
    isRefreshToken = false,
  ): Promise<{ userId: number; userEmail: string }> {
    const secret = isRefreshToken
      ? this.configService.get<string>('jwt.refreshSecret')
      : this.configService.get<string>('jwt.accessSecret');

    const token = isRefreshToken ? tokenDto.refreshToken : tokenDto.accessToken;

    if (!token) {
      this.logger.warn('Token not provided');
      throw HttpExceptionHelper.badRequest('Token is required');
    }

    this.logger.log('Verifying JWT token');

    try {
      const decoded = await this.JwtService.verify(token, { secret });
      this.logger.log('JWT token verified successfully');
      return decoded;
    } catch (error) {
      this.logger.error('Error verifying JWT token', error?.message || error);
      throw HttpExceptionHelper.unauthorized('Invalid or expired token');
    }
  }

  async refreshToken(tokenDto: TokenDto): Promise<LoginResponseDto> {
    if (!tokenDto?.refreshToken) {
      this.logger.warn('Refresh token is required for token refresh');
      throw HttpExceptionHelper.badRequest('Refresh token is required');
    }

    try {
      const { userEmail } = await this.verifyRefreshToken(tokenDto);

      const user = await this.findByEmail(userEmail);

      if (!user || user.status !== 'APPROVED') {
        this.logger.warn(`User with ID ${user.id} not found or unapproved`);
        throw HttpExceptionHelper.unauthorized('User not found or unapproved');
      }

      return this.generateToken(user);
    } catch (error) {
      this.logger.error('Invalid refresh token', error?.message || error);
      throw HttpExceptionHelper.unauthorized('Invalid refresh token');
    }
  }

  async verifyRefreshToken(
    tokenDto: TokenDto,
  ): Promise<{ userId: number; userEmail: string }> {
    if (!tokenDto.refreshToken) {
      throw HttpExceptionHelper.badRequest('Refresh token is required');
    }

    try {
      return await this.verifyToken(tokenDto, true);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw HttpExceptionHelper.unauthorized('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw HttpExceptionHelper.unauthorized('Invalid refresh token');
      } else {
        throw HttpExceptionHelper.internalServerError(
          'Server error while verifying refresh token',
        );
      }
    }
  }

  // register pateint
  async registerUser(registerDto: RegisterUserDto): Promise<UserResponseDto> {
    this.logger.log('Registering new user');

    const { email } = registerDto;

    // Check for existing user by email
    const existingUser = await this.databaseService.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      this.logger.warn(
        `User registration failed: Email ${email} already exists`,
      );
      throw HttpExceptionHelper.confilct('Email is already in use');
    }

    // Create new user
    const createUserData = {
      ...registerDto,
      role: Role.PATIENT,
      status: UserStatus.NOT_APPROVED,
      temporaryAccount: false,
      phoneNumber: undefined,
      country: undefined,
      sex: undefined,
    };

    const user = await this.databaseService.user.create({
      data: createUserData,
    });
    this.logger.log(`new pateint registered with email: ${email}`);

    return plainToInstance(UserResponseDto, user);
  }

  //db query utility function
  async findByEmail(email: string): Promise<any | null> {
    const user = await this.databaseService.user.findUnique({
      where: { email },
    });

    if (!user) {
      this.logger.log(`user not found with email:${email}`);
      throw HttpExceptionHelper.notFound('user not found');
    }
    this.logger.log(`user found with email:${email}`);

    return user;
  }
}

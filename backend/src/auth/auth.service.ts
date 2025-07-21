import { Injectable, Logger } from '@nestjs/common';
import { LoginResponseDto, LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { UserResponseDto } from 'src/user/dto/user-response.dto';
import { Role } from './enums/role.enum';
import { RegisterUserDto } from './dto/register-user.dto';
import { User, UserRole, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenDto, TokenDto } from './dto/token.dto';
import { DatabaseService } from 'src/database/database.service';
import { plainToInstance } from 'class-transformer';
import { OidcUserDto } from './dto/oidc-user.dto';
import { promises } from 'dns';


function generateStrongPassword(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}


@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly JwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) { }

  async canLoginLocal(user: { id: number, email: string, role: string }): Promise<boolean> {
    if (process.env.LOGIN_METHOD === 'password') {
      return true;
    }
    if (user && user.role === Role.PRACTITIONER) {
      return false;
    } else if (user.email) {
      const isPractitioner = await this.findByEmailRole(
        user.email,
        UserRole.PRACTITIONER,
      );
      return !isPractitioner;
    }
    return false;
  }

  async validateUser(
    loginUserDto: LoginUserDto,
  ): Promise<{ userId: number; userEmail: string, userRole: string }> {
    const user = await this.findByEmail(loginUserDto.email);
    const userRole= user.role
    if (!user || user.temporaryAccount) {
      this.logger.warn(`No valid user found for email ${loginUserDto.email}`);
      throw HttpExceptionHelper.notFound('user not found/user not valid');
    }
    if (user.status !== UserStatus.APPROVED) {
      this.logger.warn(`LocalStrategy: User ${user.id} is not approved`);
      throw HttpExceptionHelper.badRequest('user is not approved');
    }
    if (!user.password.startsWith('$2b$')) {
      const hashed = await this.encryptPassword(user.password);
      await this.databaseService.user.update({
        where: { id: user.id },
        data: { password: hashed },
      });
      user.password = hashed;
    }
    const passwordMatch = await bcrypt.compare(
      loginUserDto.password,
      user.password,
    );
    if (!passwordMatch) {
      this.logger.warn(`LocalStrategy: Incorrect password for user ${user.id}`);
      throw HttpExceptionHelper.unauthorized('Incorrect Password');
    }
    if (!this.isRoleAuthorized(userRole, loginUserDto.role)) {
      this.logger.warn(`Role mismatch: User has ${userRole}, tried to access ${loginUserDto.role}`);
      throw HttpExceptionHelper.unauthorized(`Can't login as ${userRole.toLowerCase()}`);
    }
    this.logger.log(`validateUser: ${user.email} validate successfully`)
    return {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role
    };
  }

  async loginUser(userDto: { id: string, email: string }): Promise<TokenDto> {
    const userEntity = await this.findByEmail(userDto.email)
    const user = new UserResponseDto(userEntity);
    const tokens = await this.generateToken(user);
    return tokens;
  }

  async generateToken(user: UserResponseDto): Promise<TokenDto> {
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

    return { accessToken, refreshToken };
  }

  async verifyToken(
    token: string,
    isRefreshToken = false,
  ): Promise<{ userId: number; userEmail: string }> {
    const secret = isRefreshToken
      ? this.configService.get<string>('jwt.refreshSecret')
      : this.configService.get<string>('jwt.accessSecret');


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

  async refreshToken(refreshToken: RefreshTokenDto): Promise<TokenDto> {
    if (!refreshToken.refreshToken) {
      this.logger.warn('Refresh token is required for token refresh');
      throw HttpExceptionHelper.badRequest('Refresh token is required');
    }
    try {
      const { userEmail } = await this.verifyRefreshToken(refreshToken);

      const user = await this.findByEmail(userEmail);

      if (!user || user.status !== 'APPROVED') {
        this.logger.warn(`User with ID ${user.id} not found or unapproved`);
        throw HttpExceptionHelper.unauthorized('User not found or unapproved');
      }

      return this.generateToken(user);
    } catch (error) {
      this.logger.error('Invalid refresh token', error?.message || error);
      throw HttpExceptionHelper.unauthorized('Invalid or expired token');
    }
  }

  async verifyRefreshToken(
    refreshToken: RefreshTokenDto,
  ): Promise<{ userId: number; userEmail: string }> {
    if (!refreshToken.refreshToken) {
      this.logger.warn('Refresh token is required for token refresh');
      throw HttpExceptionHelper.badRequest('Refresh token is required');
    }

    try {
      return await this.verifyToken(refreshToken.refreshToken, true);
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
      throw HttpExceptionHelper.conflict('Email is already in use');
    }
    // Hash password
    const hashedPassword = await this.encryptPassword(registerDto.password)

    // Create new user
    const createUserData = {
      ...registerDto,
      password: hashedPassword,
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
      return
    }
    this.logger.log(`user found with email:${email}`);
    return user;
  }

  async findByEmailRole(
    email: string,
    role: UserRole)
    : Promise<any | null> {
    const user = await this.databaseService.user.findUnique({
      where: { email, role },
    });
    if (!user) {
      this.logger.log(`user not found with email:${email} and role:${role}`);
      return
    }
    this.logger.log(`user found with email:${email}`);
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }


  // oidc user validation

  async validateAdmin(  //validate admin
    user: OidcUserDto,
  ): Promise<LoginResponseDto> {
    this.logger.log(`oidc admin validation called`);

    if (!user.email) {
      this.logger.error('Email is missing in user object');
      throw HttpExceptionHelper.badRequest('Email is required');
    }
    const existingUser = await this.findByEmailRole(user.email, UserRole.ADMIN);
    if (existingUser && existingUser.role === Role.ADMIN) {
      if (existingUser.status !== UserStatus.APPROVED) {
        this.logger.log(`Admin with ${existingUser.email} not approved`);
        throw HttpExceptionHelper.unauthorized(`Admin with ${existingUser.email} not approved`);
      }
    }
    if (!existingUser) {
      this.logger.error(`user not found with role: ${UserRole.ADMIN}`);
      throw HttpExceptionHelper.notFound(`user not found with email: ${user.email} and role: ${UserRole.ADMIN}`);
    }
    const { accessToken, refreshToken } = await this.generateToken(existingUser);
    const userDto = new UserResponseDto(existingUser);
    return {
      user: userDto,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }


  async validatePractitioner(  // validate practitioner , if role is admin then give access else create new practitioner 
    user: OidcUserDto,
  ): Promise<LoginResponseDto> {
    this.logger.log(`oidc practitioner validation called`);

    if (!user.email) {
      this.logger.error('Email is missing in user object');
      throw HttpExceptionHelper.badRequest('Email is required');
    }

    let existingUser = await this.findByEmailRole(user.email, UserRole.PRACTITIONER).catch(() => null);
    if (existingUser && existingUser.role === Role.PRACTITIONER) {
      if (existingUser.status !== UserStatus.APPROVED) {
        this.logger.log(`Practitioner with ${existingUser.email} not approved`);
        throw HttpExceptionHelper.unauthorized(`Practitioner with ${existingUser.email} not approved`);
      }
    }
    if (!existingUser) {
      this.logger.log(` practitioner user not found with email: ${user.email}`);
      existingUser = await this.findByEmailRole(user.email, UserRole.ADMIN).catch(() => null);
    }
    if (!existingUser) {
      const patientUser = await this.findByEmailRole(user.email, UserRole.PATIENT).catch(() => null);
      if (patientUser) {
        this.logger.warn(`User with email ${user.email} already exists as PATIENT`);
        throw HttpExceptionHelper.unauthorized(`Cannot register as PRACTITIONER. Email already exists as PATIENT.`);
      }
    }
    if (!existingUser) {
      this.logger.log(`Creating new practitioner user with email: ${user.email}`);
      // Create new Practitioner
      const createUserData = {
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.email!,
        role: Role.PRACTITIONER,
        status: process.env.OPENID_AUTOCREATE_USER === 'true' ? UserStatus.APPROVED : UserStatus.NOT_APPROVED,
        temporaryAccount: false,
        phoneNumber: null,
        country: null,
        sex: null,
        password: generateStrongPassword(),
      };
      existingUser = await this.databaseService.user.create({
        data: createUserData,
      });
    }


    const { accessToken, refreshToken } = await this.generateToken(existingUser);
    const userDto = new UserResponseDto(existingUser);
    this.logger.log(`Successfully logged in as Practitioner with ${existingUser.email}`);
    return {
      user: userDto,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }


  async loginUserValidate(
    user: OidcUserDto) {
    const role = (user.role as string)?.toUpperCase() as Role;
    switch (role) {
      case Role.ADMIN:
        return this.validateAdmin(user);
      case Role.PRACTITIONER:
        return this.validatePractitioner(user);
      default:
        return null
    }
  }



  async getcurrentuser(id: number): Promise<UserResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
      include: {
        OrganizationMember: { include: { organization: true } },
        GroupMember: { include: { group: true } },
        languages: { include: { language: true } },
        specialities: { include: { speciality: true } },
      },
    });

    if (!user) {
      throw HttpExceptionHelper.notFound('User not found');
    }
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }



  encryptPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }
  isRoleAuthorized(userRole: string, uiRole: string): boolean {
    if (!userRole || !uiRole) return false;

    const normalizedUserRole = userRole.toUpperCase() as Role;
    const normalizedUiRole = uiRole.toUpperCase() as Role;

    if (normalizedUserRole === Role.ADMIN.toUpperCase()) return true;
    if (normalizedUserRole === Role.PRACTITIONER.toUpperCase()) return normalizedUiRole === Role.PRACTITIONER;
    if (normalizedUserRole === Role.PATIENT.toUpperCase()) return normalizedUiRole === Role.PATIENT;
    return false;
  }


}

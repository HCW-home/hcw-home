import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from 'src/database/database.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

interface OpenIDUserProfile {
  sub: string;
  email: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  provider: string;
  phoneNumber: string;
  country: string;
  language: string;
  sex: 'male' | 'female' | 'other';
  status?: 'approved' | 'not_approved';
  role?: 'Patient' | 'Practitioner' | 'Admin';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prismaService: DatabaseService,
    private jwtService: JwtService,
  ) {}

  /**
   * Validate or provision a user from OpenID Connect profile
   */
  async validateOpenIDUser(profile: OpenIDUserProfile) {
    this.logger.debug(`Validating OpenID user with sub: ${profile.sub}`);

    // Ensure required profile fields
    if (!profile.email) {
        throw new Error('Email is required from the OpenID provider');
      }

    let user = await this.prismaService.user.findUnique({
      where: { sub: profile.sub },
    });

    if (!user) {
      // Try lookup by email
      user = await this.prismaService.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        // Link existing account to OpenID
        this.logger.debug(
          `Linking existing user (email) to OpenID sub ${profile.sub}`,
        );
        user = await this.prismaService.user.update({
          where: { id: user.id },
          data: {
            sub: profile.sub,
            provider: profile.provider,
            phoneNumber: profile.phoneNumber,
            country: profile.country,
            language:profile.language,
            sex:profile.sex,
            status: profile.status || user.status,
            role: profile.role || user.role,
            lastLogin: new Date(),
          },
        });
      } else {
        // Create new user
        this.logger.debug(`Creating new user for OpenID sub ${profile.sub}`);
        const rawPass = randomBytes(16).toString('hex');
        const hashedPass = await bcrypt.hash(rawPass, 10);
        user = await this.prismaService.user.create({
          data: {
            sub: profile.sub,
            provider: profile.provider,
            email: profile.email,
            firstName: profile.givenName || profile.name || '',
            lastName: profile.familyName || '',
            password: hashedPass,
            temporaryAccount: true,
            phoneNumber: profile.phoneNumber,
            country: profile.country,
            language:profile.language,
            sex:profile.sex,
            status: profile.status || 'not_approved',
            role: profile.role || 'Patient',
            lastLogin: new Date(),
          },
        });
      }
    } else {
      // Update linked user
      this.logger.debug(
        `Updating linked user sub ${profile.sub} last login and claims`,
      );
      user = await this.prismaService.user.update({
        where: { id: user.id },
        data: {
          email: profile.email,
          firstName: profile.givenName || profile.name || user.firstName,
          lastName: profile.familyName || user.lastName,
          phoneNumber: profile.phoneNumber,
          country: profile.country,
          language:profile.language,
          sex:profile.sex,
          status: profile.status || user.status,
          role: profile.role || user.role,
          lastLogin: new Date(),
        },
      });
    }

    return user;
  }

  /**
   * Generate a JWT from user entity
   */
  generateJwtToken(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return this.jwtService.sign(payload);
  }

  /**
   * Validate JWT payload
   */
  async validateJwt(payload: any) {
    return this.prismaService.user.findUnique({
      where: { id: payload.sub },
    });
  }
}

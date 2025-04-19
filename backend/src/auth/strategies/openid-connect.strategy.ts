import { Strategy } from 'passport-openidconnect';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class OpenIDConnectStrategy extends PassportStrategy(Strategy, 'openidconnect') {
  private readonly logger = new Logger(OpenIDConnectStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      issuer: configService.get<string>('OPENID_ISSUER') ?? '',
      clientID: configService.get<string>('OPENID_CLIENT_ID') ?? '',
      clientSecret: configService.get<string>('OPENID_CLIENT_SECRET') ?? '',
      callbackURL: configService.get<string>('OPENID_CALLBACK_URL') ?? '',
      scope: 'openid profile email phone country locale gender roles status',
      passReqToCallback: true,
      authorizationURL: configService.get<string>('OPENID_AUTHORIZATION_URL') ?? '',
      tokenURL: configService.get<string>('OPENID_TOKEN_URL') ?? '',
      userInfoURL: configService.get<string>('OPENID_USERINFO_URL') ?? '',
    });
  }

  async validate(
    req: any,
    issuer: string,
    profile: any,
    idToken: any,
    accessToken: any,
    refreshToken: any,
    done: any,
  ) {
    try {
      this.logger.debug(`Profile received from OpenID provider: ${JSON.stringify(profile)}`);

      const raw: any = profile._json || {};
      const user = await this.authService.validateOpenIDUser({
        sub: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        givenName: profile.name?.givenName,
        familyName: profile.name?.familyName,
        provider: issuer,
        phoneNumber: raw.phone_number,
        country: raw.country,
        language: raw.locale || raw.language,
        sex: raw.gender,
        status: raw.status,
        role: raw.role,
      });

      return done(null, user);
    } catch (error) {
      this.logger.error(`Error validating OpenID user: ${error.message}`);
      return done(error, false);
    }
  }
}

import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Strategy as OpenIDConnectStrategy, Profile } from 'passport-openidconnect';
import { Request } from 'express';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { OidcUserDto } from '../dto/oidc-user.dto';
import { AuthService } from '../auth.service';
import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';
import { Role } from '../enums/role.enum';
import { ConfigService } from 'src/config/config.service';

// admin oidc login

@Injectable()
export class AdminStrategy extends PassportStrategy(OpenIDConnectStrategy, 'openidconnect_admin') {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {
    const data = configService.getAdminOidcConfig();
    super({
      ...data,
      passReqToCallback: true,
    });
  }
  async validate(
    req: Request,
    issuer: string,
    profile: Profile,
    done: Function,
  ): Promise<any> {
    try {
      if (!profile) {
        throw HttpExceptionHelper.notFound("profile data not found")
      }
      const [firstName, lastName] = profile.displayName ? profile.displayName.split(' ') : ['', ''];
      const user: OidcUserDto = {
        email: profile.emails?.[0]?.value,
        firstName,
        lastName,
        role: Role.ADMIN,
      };
      const data = await this.authService.loginUserValidate(user)
      const response = ApiResponseDto.success(data, "user-registration successfull", 200)
      return done(null, response);
    } catch (err) {
      return done(err, null);
    }
  }
}



// import { PassportStrategy } from '@nestjs/passport';
// import { Injectable } from '@nestjs/common';
// import { Strategy as OpenIDConnectStrategy, Profile } from 'passport-openidconnect';
// import { Request } from 'express';
// import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
// import { OidcUserDto } from '../dto/oidc-user.dto';
// import { AuthService } from '../auth.service';
// import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';

// // general oidc login

// @Injectable()
// export class OpenIdStrategy extends PassportStrategy(OpenIDConnectStrategy, 'openidconnect') {
//   constructor(
//     private readonly authService: AuthService
//   ) {
//     super({
//       issuer: 'https://dev-1top0t1k87t4066s.us.auth0.com/',
//       authorizationURL: 'https://dev-1top0t1k87t4066s.us.auth0.com/authorize',
//       tokenURL: 'https://dev-1top0t1k87t4066s.us.auth0.com/oauth/token',
//       userInfoURL: 'https://dev-1top0t1k87t4066s.us.auth0.com/userinfo',
//       clientID: 'wQ9a6B0mMQqkzrtghGq1a7i5gTSvVslZ',
//       clientSecret: 'krqj5cj_xF3AGS6K86RyZmN1KoZobehJQQYMVZ9yOWBiSb9jgPcySDDFu0SH8gpL',
//       callbackURL: 'http://localhost:3000/api/v1/auth/callback/openidconnect',
//       scope: ['openid', 'profile', 'email'],
//       passReqToCallback: true,
//     });
//   }
//   async validate(
//     req: Request,
//     issuer: string,
//     profile: Profile,
//     done: Function,
//   ): Promise<any> {
//     try {
//       const role = req.session['oidc-role'];
//       delete req.session['oidc-role'];
//       if (!profile) {
//         throw HttpExceptionHelper.notFound("profile data not found")
//       }
//       const [firstName, lastName] = profile.displayName ? profile.displayName.split(' ') : ['', ''];
//       const user: OidcUserDto = {
//         email: profile.emails?.[0]?.value,
//         firstName,
//         lastName,
//         provider: profile.provider,
//         role,
//       };
//       const data = await this.authService.loginUserValidate(user)
//       const response =ApiResponseDto.success(data, "user-registration successfull", 200)
//       return done (null ,response);
//     } catch (err) {
//       return done(err, null);
//     }
//   }
// }



// // issuer: "http://localhost:8080/realms/keyclock-2",
// // authorizationURL: "http://localhost:8080/realms/keyclock-2/protocol/openid-connect/auth",
// // tokenURL: "http://localhost:8080/realms/keyclock-2/protocol/openid-connect/token",
// // userInfoURL: "http://localhost:8080/realms/keyclock-2/protocol/openid-connect/userinfo",
// // clientID: "hcw-backend",
// // clientSecret: "DhjcVq6POXGKTDCeh3323az13218t6Ui",
// // callbackURL: "http://localhost:3000/api/v1/auth/callback/keycloak",
// // scope: ['openid', 'profile', 'email'],
// // passReqToCallback: true,
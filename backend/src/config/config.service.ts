import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { Environment } from './environment.enum';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  get port(): number {
    return this.configService.get<number>('PORT', 3000);
  }

  get producerStatsPollInterval(): number {
    return this.getNumber('PRODUCER_STATS_POLL_INTERVAL', 5000);
  }

  get emailSendgridApiKey(): string {
    return this.configService.get<string>('EMAIL_SENDGRID_API_KEY')!;
  }

  get emailSenderAddress(): string {
    return this.configService.get<string>('EMAIL_SENDER_ADDRESS')!;
  }

  get emailReminderLeadMinutes(): number {
    return Number(this.configService.get('EMAIL_REMINDER_LEAD_MINUTES')) || 60;
  }

  get transportStatsPollInterval(): number {
    return this.getNumber('TRANSPORT_STATS_POLL_INTERVAL', 5000);
  }

  get environment(): Environment {
    return this.configService.get<Environment>(
      'NODE_ENV',
      Environment.DEVELOPMENT,
    );
  }

  get isDevelopment(): boolean {
    return this.environment === Environment.DEVELOPMENT;
  }

  get isStaging(): boolean {
    return this.environment === Environment.STAGING;
  }

  get isProduction(): boolean {
    return this.environment === Environment.PRODUCTION;
  }

  get databaseUrl(): string {
    const url = this.configService.get<string>('DATABASE_URL', '');
    if (!url && this.isProduction) {
      throw new Error('Database URL is required in production environment');
    }
    return url;
  }

  get jwtSecret(): string {
    const secret = this.configService.get<string>('APP_SECRET', '');
    if (!secret && this.isProduction) {
      throw new Error('JWT secret is required in production environment');
    }
    return secret;
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('ACCESS_TOKEN_LIFE', '24h');
  }

  get jwtRefreshSecret(): string {
    return this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'default_refresh_secret',
    );
  }

  get jwtRefreshExpiresIn(): string {
    return this.configService.get<string>('REFRESH_TOKEN_LIFE', '7d');
  }

  get corsOrigin(): string[] {
    return [
      this.configService.get<string>('ADMIN_URL'),
      this.configService.get<string>('PRACTITIONER_URL'),
      this.configService.get<string>('PATIENT_URL'),
    ].filter(Boolean) as string[];
  }

  get mediasoupAnnouncedIp(): string {
    return this.getRequired<string>(
      'MEDIASOUP_ANNOUNCED_IP',
      'Announced IP is required',
    );
  }

  get redisUrl(): string {
    return this.getRequired<string>('REDIS_URL', 'Redis URL is required');
  }

  get serverId(): string {
    return this.getRequired<string>('SERVER_ID', 'Server ID is required');
  }

  get swaggerConfig() {
    return {
      enabled: this.isDevelopment,
      title: this.configService.get<string>(
        'SWAGGER_TITLE',
        'HCW-Home Backend API',
      ),
      description: this.configService.get<string>(
        'SWAGGER_DESCRIPTION',
        'Comprehensive API documentation for HCW-Home Backend services',
      ),
      version: this.configService.get<string>('SWAGGER_VERSION', '1.0.0'),
      path: this.configService.get<string>('SWAGGER_PATH', 'api/docs'),
    };
  }

  get shouldEnableCors(): boolean {
    return !this.isProduction;
  }

  get shouldEnableSwagger(): boolean {
    return this.isDevelopment;
  }

  get shouldDisableErrorMessages(): boolean {
    return this.isProduction;
  }

  get frontendConfig(): {
    loginMethod: string;
    branding: string;
    logo: string;
  } {
    return {
      loginMethod: this.configService.get<string>('LOGIN_METHOD', 'password'),
      branding: this.configService.get<string>('BRANDING', '@HOME'),
      logo: this.configService.get<string>('LOGO', ''),
    };
  }

  get logFormat(): string {
    return this.configService.get<string>('LOGFORMAT', 'default');
  }

  get consultationRetentionHours(): number {
    return this.getNumber('CONSULTATION_RETENTION_HOURS', 24);
  }

  get consultationDeletionBufferHours(): number {
    return this.getNumber('CONSULTATION_DELETION_BUFFER_HOURS', 1);
  }

  getOptional<T = string>(key: string): T | undefined {
    return this.configService.get<T>(key);
  }

  getRequired<T = string>(key: string, errorMessage?: string): T {
    const value = this.configService.get<T>(key);
    if (value === undefined || value === null) {
      throw new Error(
        errorMessage || `Required environment variable ${key} is missing`,
      );
    }
    return value;
  }

  private getNumber(key: string, defaultValue: number): number {
    const value = this.configService.get<string>(key);
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getAdminOidcConfig() {
    const oidc = this.configService.get('oidc');
    const callbackURL = `${oidc.callbackBaseURL}/openidconnect_admin?role=admin`;
    return {
      issuer: oidc.issuer,
      authorizationURL: oidc.authorizationURL,
      tokenURL: oidc.tokenURL,
      userInfoURL: oidc.userInfoURL,
      clientID: oidc.clientID,
      clientSecret: oidc.clientSecret,
      callbackURL,
      scope: oidc.scope,
    };
  }
  getPractitionerOidcConfig() {
    const oidc = this.configService.get('oidc');
    const callbackURL = `${oidc.callbackBaseURL}/openidconnect_practitioner?role=practitioner`;

    return {
      issuer: oidc.issuer,
      authorizationURL: oidc.authorizationURL,
      tokenURL: oidc.tokenURL,
      userInfoURL: oidc.userInfoURL,
      clientID: oidc.clientID,
      clientSecret: oidc.clientSecret,
      callbackURL,
      scope: oidc.scope,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { Environment } from './environment.enum';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  get port(): number {
    return this.configService.get<number>('PORT', 3000);
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
    const secret = this.configService.get<string>('JWT_SECRET', '');
    if (!secret && this.isProduction) {
      throw new Error('JWT secret is required in production environment');
    }
    return secret;
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '24h');
  }

  get corsOrigin(): string {
    return this.configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:4200',
    );
  }

  get swaggerConfig() {
    return {
      title: this.configService.get<string>(
        'SWAGGER_TITLE',
        'HCW-Home Backend API',
      ),
      description: this.configService.get<string>(
        'SWAGGER_DESCRIPTION',
        'Comprehensive API documentation for HCW-Home Backend services',
      ),
      version: this.configService.get<string>('SWAGGER_VERSION', '1.0.0'),
    };
  }

  // Helper methods for common checks
  get shouldEnableCors(): boolean {
    return !this.isProduction;
  }

  get shouldEnableSwagger(): boolean {
    return this.isDevelopment;
  }

  get shouldDisableErrorMessages(): boolean {
    return this.isProduction;
  }

  get frontendConfig() {
    return this.configService.get('frontend');
  }

  // Additional helper methods for getting optional values
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

  get consultationRetentionHours(): number {
    return this.getNumber('CONSULTATION_RETENTION_HOURS', 24);
  }

  get consultationDeletionBufferHours(): number {
    return this.getNumber('CONSULTATION_DELETION_BUFFER_HOURS', 1);
  }

  private getNumber(key: string, defaultValue: number): number {
    const value = this.configService.get<string>(key);
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}

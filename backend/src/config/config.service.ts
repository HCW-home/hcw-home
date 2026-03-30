import { Injectable, Logger } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { Environment } from './environment.enum';
import { UserRole } from '@prisma/client';

@Injectable()
export class ConfigService {
  // SSL/TLS for HTTPS
  get sslKeyPath(): string | undefined {
    return this.configService.get<string>('SSL_KEY_PATH');
  }
  get sslCertPath(): string | undefined {
    return this.configService.get<string>('SSL_CERT_PATH');
  }

  get monitoringDsn(): string | undefined {
    return this.configService.get<string>('MONITORING_DSN');
  }

  // Security Headers
  get helmetHstsMaxAge(): number | undefined {
    const raw = this.configService.get<string>('HELMET_HSTS_MAX_AGE');
    if (!raw) return undefined;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  get helmetCsp() {
    return {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    };
  }

  get rateLimitWindowMs() {
    return this.getNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  }
  get rateLimitMax() {
    return this.getNumber('RATE_LIMIT_MAX', 1000);
  }
  get rateLimitMessage() {
    return {
      error: this.configService.get<string>('RATE_LIMIT_ERROR', 'Too many requests'),
      message: this.configService.get<string>('RATE_LIMIT_MESSAGE', 'Rate limit exceeded, please try again later.'),
    };
  }
  get healthPath() {
    return this.configService.get<string>('HEALTH_PATH', '/api/v1/health');
  }
  get healthAltPath() {
    return this.configService.get<string>('HEALTH_ALT_PATH', '/health');
  }
  get authRateLimitPath() {
    return this.configService.get<string>('AUTH_RATE_LIMIT_PATH', '/api/v1/auth');
  }
  get authRateLimitWindowMs() {
    return this.getNumber('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  }
  get authRateLimitMax() {
    return this.getNumber('AUTH_RATE_LIMIT_MAX', 50);
  }
  get authRateLimitMessage() {
    return {
      error: this.configService.get<string>('AUTH_RATE_LIMIT_ERROR', 'Too many authentication attempts'),
      message: this.configService.get<string>('AUTH_RATE_LIMIT_MESSAGE', 'Authentication rate limit exceeded, please try again later.'),
    };
  }

  get compressionLevel() {
    return this.getNumber('COMPRESSION_LEVEL', this.isProduction ? 6 : 1);
  }
  get compressionThreshold() {
    return this.getNumber('COMPRESSION_THRESHOLD', 1024);
  }
  get responseTimeoutMs() {
    return this.getNumber('RESPONSE_TIMEOUT_MS', 30000);
  }
  get timeoutError() {
    return this.configService.get<string>('TIMEOUT_ERROR', 'Request Timeout');
  }
  get timeoutMessage() {
    return this.configService.get<string>('TIMEOUT_MESSAGE', 'Request took too long to process');
  }

  // --- CORS Config ---
  corsOptions(logger?: Logger) {
    return {
      origin: (origin, callback) => {
        const allowedOrigins = this.corsOrigins;
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          if (logger) logger.warn?.(`Blocked CORS request from origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'Cache-Control',
      ],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
      maxAge: 86400,
    };
  }

  get uploadsPath() {
    return this.configService.get<string>('UPLOADS_PATH') || require('path').join(__dirname, '..', '..', 'uploads');
  }
  get staticAssetsOptions() {
    return {
      prefix: this.configService.get<string>('STATIC_ASSETS_PREFIX', '/uploads/'),
      maxAge: this.getNumber('STATIC_ASSETS_MAX_AGE', 31536000000),
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'");
        if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.gif')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    };
  }

  // --- Swagger Server URL ---
  get swaggerServerUrl() {
    return this.configService.get<string>('SWAGGER_SERVER_URL', `http://localhost:${this.port}/api`);
  }
  private readonly logger = new Logger(ConfigService.name);

  constructor(private readonly configService: NestConfigService) { }

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

  /**
   * Debounce (milliseconds) for focused patient_joined emits to practitioners
   * Can be configured via PATIENT_JOINED_DEBOUNCE_MS environment variable
   */
  get patientJoinedDebounceMs(): number {
    const raw = this.configService.get<string>('PATIENT_JOINED_DEBOUNCE_MS');
    if (!raw) return 10000; // default 10s
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 10000 : parsed;
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

  get patientUrl(): string {
    return this.configService.get<string>(
      'PATIENT_URL',
      this.isDevelopment ? 'http://localhost:4201' : '',
    );
  }

  get practitionerUrl(): string {
    return this.configService.get<string>(
      'PRACTITIONER_URL',
      this.isDevelopment ? 'http://localhost:4202' : '',
    );
  }

  get adminUrl(): string {
    return this.configService.get<string>(
      'ADMIN_URL',
      this.isDevelopment ? 'http://localhost:4200' : '',
    );
  }

  get mediasoupAnnouncedIp(): string {
    return this.getRequired<string>(
      'MEDIASOUP_ANNOUNCED_IP',
      'Announced IP is required',
    );
  }

  get redisUrl(): string {
    if (this.isDevelopment) {
      return this.configService.get<string>('REDIS_URL', '');
    }
    return this.getRequired<string>('REDIS_URL', 'Redis URL is required for production');
  }

  get serverId(): string {
    if (this.isDevelopment) {
      return this.configService.get<string>('SERVER_ID', 'dev-server-1');
    }
    return this.getRequired<string>('SERVER_ID', 'Server ID is required for production');
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

  // WhatsApp Configuration
  get whatsappTemplatesPath(): string {
    return this.configService.get<string>(
      'whatsapp.templatesPath',
      'src/json/whatsapp-templates.json',
    );
  }

  get twilioAuthToken(): string {
    return this.configService.get<string>('twilio.authToken', 'twilio-auth');
  }

  get twilioAccountSid(): string {
    return this.configService.get<string>(
      'twilio.accountSid',
      'twilio-account-sid',
    );
  }

  // File Upload Configuration
  get maxFileUploadSizeBytes(): number {
    return this.configService.get<number>('upload.maxFileSizeBytes', 10 * 1024 * 1024);
  }

  // Alternative method to get the raw WHATSAPP_TEMPLATES_PATH env variable
  get whatsappTemplatesPathFromEnv(): string | undefined {
    return this.configService.get<string>('WHATSAPP_TEMPLATES_PATH');
  }

  // Additional helper methods for getting optional values
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

  get backendApiBaseUrl(): string {
    return this.configService.get<string>('BACKEND_API_BASE_URL') ||
      `http://localhost:${this.port}`;
  }  // WebSocket Configuration
  get websocketNamespace(): string {
    return this.configService.get<string>('WEBSOCKET_NAMESPACE', '/');
  }

  get corsOrigins(): string[] {
    const corsOrigins = this.configService.get<string>('CORS_ORIGINS', '');
    const appUrls = [
      this.patientUrl,
      this.practitionerUrl,
      this.adminUrl
    ].filter(Boolean);

    const allOrigins = [
      ...corsOrigins.split(',').map(origin => origin.trim()).filter(Boolean),
      ...appUrls
    ];

    // Remove duplicates and filter out empty values
    return [...new Set(allOrigins)].filter(Boolean);
  }

  // Session and Timeout Configuration
  get sessionTimeoutMs(): number {
    return this.getNumber('SESSION_TIMEOUT_MS', 30 * 60 * 1000); // 30 minutes default
  }

  // ================ WAITING ROOM & AUDIO ALERT CONFIGURATION ================

  get soundAlertEnabled(): boolean {
    return this.configService.get<string>('SOUND_ALERT_ENABLED')?.toLowerCase() === 'true' || true;
  }

  get soundAlertUrl(): string {
    return this.configService.get<string>('SOUND_ALERT_URL') || '/assets/sounds/patient-joined.mp3';
  }

  get waitingRoomTimeoutMinutes(): number {
    return this.getNumber('WAITING_ROOM_TIMEOUT_MINUTES', 30);
  }

  get maxWaitingRoomSessions(): number {
    return this.getNumber('MAX_WAITING_ROOM_SESSIONS', 10);
  }

  // ================ CONSULTATION URLS GENERATION ================
  // (See comprehensive generateConsultationUrls method below)

  get consultationTimeoutMs(): number {
    return this.getNumber('CONSULTATION_TIMEOUT_MS', 60 * 60 * 1000); // 1 hour
  }

  // Frontend Route Generators - Simplified URL Management
  generatePatientRoute(route: string): string {
    const baseUrl = this.patientUrl;
    if (!baseUrl) {
      this.logger.warn('Patient app URL not configured, using relative path');
      return route.startsWith('/') ? route : `/${route}`;
    }
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    return `${cleanBaseUrl}${cleanRoute}`;
  }

  generatePractitionerRoute(route: string): string {
    const baseUrl = this.practitionerUrl;
    if (!baseUrl) {
      this.logger.warn('Practitioner app URL not configured, using relative path');
      return route.startsWith('/') ? route : `/${route}`;
    }
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    return `${cleanBaseUrl}${cleanRoute}`;
  }

  generateAdminRoute(route: string): string {
    const baseUrl = this.adminUrl;
    if (!baseUrl) {
      this.logger.warn('Admin app URL not configured, using relative path');
      return route.startsWith('/') ? route : `/${route}`;
    }
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    return `${cleanBaseUrl}${cleanRoute}`;
  }

  generateApiRoute(route: string): string {
    const baseUrl = this.backendApiBaseUrl;
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    return `${cleanBaseUrl}${cleanRoute}`;
  }

  // Consultation-Specific URL Generators
  generateConsultationUrls(consultationId: number, userRole: UserRole | string) {
    const patientWaitingRoom = this.generatePatientRoute(`/waiting-room/${consultationId}`);
    const patientConsultationRoom = this.generatePatientRoute(`/consultation-room/${consultationId}`);
    const practitionerConsultationRoom = this.generatePractitionerRoute(`/consultation/${consultationId}`);

    return {
      patient: {
        waitingRoom: patientWaitingRoom,
        consultationRoom: patientConsultationRoom,
        dashboard: this.generatePatientRoute('/dashboard'),
      },
      practitioner: {
        consultationRoom: practitionerConsultationRoom,
        dashboard: this.generatePractitionerRoute('/dashboard'),
        patientManagement: this.generatePractitionerRoute(`/consultation/${consultationId}/patients`),
      },
      api: {
        smartJoin: this.generateApiRoute(`/consultation/${consultationId}/join/patient/smart`),
        status: this.generateApiRoute(`/consultation/${consultationId}/status`),
        admit: this.generateApiRoute(`/consultation/${consultationId}/admit`),
        leave: this.generateApiRoute(`/consultation/${consultationId}/leave`),
      },
      websocket: {
        chat: `/chat?consultationId=${consultationId}&userRole=${userRole}`,
        consultation: `/consultation?consultationId=${consultationId}&role=${userRole}`,
        mediasoup: `/mediasoup?consultationId=${consultationId}`,
      },
    };
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

  /**
   * Validates all critical configuration at startup
   * Call this in main.ts or app module to catch config errors early
   */
  validateConfiguration(): void {
    const errors: string[] = [];

    // Critical production checks
    if (this.isProduction) {
      if (!this.databaseUrl) {
        errors.push('DATABASE_URL is required in production');
      }
      if (!this.jwtSecret) {
        errors.push('APP_SECRET is required in production');
      }
      if (!this.patientUrl) {
        errors.push('PATIENT_URL is required in production');
      }
      if (!this.practitionerUrl) {
        errors.push('PRACTITIONER_URL is required in production');
      }
      if (!this.adminUrl) {
        errors.push('ADMIN_URL is required in production');
      }
    }

    try {
      this.mediasoupAnnouncedIp;
    } catch (error) {
      errors.push('MEDIASOUP_ANNOUNCED_IP is required');
    }

    try {
      this.redisUrl;
    } catch (error) {
      errors.push('REDIS_URL is required');
    }

    try {
      this.serverId;
    } catch (error) {
      errors.push('SERVER_ID is required');
    }

    if (errors.length > 0) {
      this.logger.error('Configuration validation failed:');
      errors.forEach(error => this.logger.error(`  - ${error}`));
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    this.logger.log('Configuration validation passed');
    this.logger.log(`Environment: ${this.environment}`);
    this.logger.log(`Patient App: ${this.patientUrl}`);
    this.logger.log(`Practitioner App: ${this.practitionerUrl}`);
    this.logger.log(`Admin App: ${this.adminUrl}`);
    this.logger.log(`Backend API: ${this.backendApiBaseUrl}`);
  }

  getAdminOidcConfig() {
    try {
      const oidc = this.configService.get('oidc');
      if (!oidc) {
        this.logger.warn('OIDC configuration not found');
        return null;
      }

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
    } catch (error) {
      this.logger.error('Failed to get admin OIDC config:', error.message);
      return null;
    }
  }

  getPractitionerOidcConfig() {
    try {
      const oidc = this.configService.get('oidc');
      if (!oidc) {
        this.logger.warn('OIDC configuration not found');
        return null;
      }

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
    } catch (error) {
      this.logger.error('Failed to get practitioner OIDC config:', error.message);
      return null;
    }
  }

  // ===================================================================
  // CHAT MODULE CONFIGURATION
  // ===================================================================

  get chatMaxFileSize(): number {
    return this.getNumber('CHAT_MAX_FILE_SIZE_MB', 10) * 1024 * 1024;
  }

  get chatMessageHistoryLimit(): number {
    return this.getNumber('CHAT_MESSAGE_HISTORY_LIMIT', 50);
  }

  get chatTypingTimeoutMs(): number {
    return this.getNumber('CHAT_TYPING_TIMEOUT_MS', 3000);
  }

  get chatTypingInactivityMs(): number {
    return this.getNumber('CHAT_TYPING_INACTIVITY_MS', 5000);
  }

  get chatMessageEditTimeoutMinutes(): number {
    return this.getNumber('CHAT_MESSAGE_EDIT_TIMEOUT_MINUTES', 5);
  }

  get chatAllowedFileTypes(): string[] {
    const defaultTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const envTypes = this.configService.get<string>('CHAT_ALLOWED_FILE_TYPES');
    if (envTypes) {
      return envTypes.split(',').map(type => type.trim());
    }

    return defaultTypes;
  }

  get chatFileUploadEnabled(): boolean {
    return this.configService.get<boolean>('CHAT_FILE_UPLOAD_ENABLED', true);
  }

  get chatImageUploadEnabled(): boolean {
    return this.configService.get<boolean>('CHAT_IMAGE_UPLOAD_ENABLED', true);
  }
}

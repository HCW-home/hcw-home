import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, VersioningType, RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { CustomLoggerService } from './logger/logger.service';
import { Environment } from './config/environment.enum';
import passport from 'passport';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';



class ApplicationBootstrap {
  private logger: CustomLoggerService;
  private externalLoggerInitialized = false;
  private readonly gracefulShutdownTimeoutMs = 10000;

  async bootstrap(): Promise<void> {
    try {
      this.validateEnvironment();

      const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bufferLogs: true,
        abortOnError: false,
      });

      const configService = app.get(ConfigService);
      this.logger = new CustomLoggerService(configService, 'Bootstrap');

      // Use custom logger for the application
      app.useLogger(this.logger);
      // Integrate external logging/monitoring if configured
      if (process.env.MONITORING_DSN) {
        this.logger.logServerAction('External monitoring configured', { dsn: process.env.MONITORING_DSN });
        this.externalLoggerInitialized = true;
      }

      // Configure security and performance middleware
      this.configureSecurityMiddleware(app, configService);
      this.configurePerformanceMiddleware(app, configService);

      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          disableErrorMessages: configService.isProduction,
          validateCustomDecorators: true,
          forbidUnknownValues: true,
          skipMissingProperties: false,
          skipNullProperties: false,
          stopAtFirstError: false,
        }),
      );

      this.configureGlobalFilters(app);

      // Configure API versioning
      this.configureApiVersioning(app);

      this.logger.logServerAction('Application initialization started', {
        environment: configService.environment,
        logFormat: configService.logFormat,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      });

      // Configure application
      this.configureCors(app, configService);
      this.configureSwagger(app, configService);
      this.configureGlobalPrefix(app);
      await this.configureSession(app, configService);
      this.configureStaticAssets(app);
      this.configurePassport(app);

      // Setup graceful shutdown
      this.setupGracefulShutdown(app);

      // Start application
      await this.startApplication(app, configService);
    } catch (error) {
      // Use console.error as fallback if logger not initialized
      if (this.logger) {
        this.logger.errorServerAction(
          'Failed to start application',
          error.stack,
          { error: error.message },
        );
      } else {
        console.error('Failed to start application:', error.message);
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  private validateEnvironment(): void {
    const nodeEnv = process.env.NODE_ENV;

    if (!nodeEnv) {
      throw new Error('NODE_ENV environment variable is required');
    }

    if (!Object.values(Environment).includes(nodeEnv as Environment)) {
      throw new Error(
        `Invalid NODE_ENV: ${nodeEnv}. Must be one of: ${Object.values(Environment).join(', ')}`,
      );
    }

    // Validate critical production environment variables
    if (nodeEnv === Environment.PRODUCTION) {
      const requiredVars = [
        'DATABASE_URL',
        'APP_SECRET',
        'REDIS_URL',
        'SERVER_ID',
        'MEDIASOUP_ANNOUNCED_IP',
      ];

      const missingVars = requiredVars.filter(varName => !process.env[varName]);

      if (missingVars.length > 0) {
        throw new Error(
          `Missing required environment variables for production: ${missingVars.join(', ')}`,
        );
      }
    }
  }

  private configureSecurityMiddleware(app: NestExpressApplication, configService: ConfigService): void {
    // Helmet for security headers
    const helmetOptions: any = {
      contentSecurityPolicy: configService.isProduction ? configService.helmetCsp : false,
      crossOriginEmbedderPolicy: false,
    };
    if (process.env.HELMET_HSTS_MAX_AGE) {
      helmetOptions.hsts = { maxAge: parseInt(process.env.HELMET_HSTS_MAX_AGE, 10) };
    }
    app.use(helmet(helmetOptions));

    // Rate limiting
    if (configService.isProduction) {
      app.use(rateLimit({
        windowMs: configService.rateLimitWindowMs,
        max: configService.rateLimitMax,
        message: configService.rateLimitMessage,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
          return req.path === configService.healthPath || req.path === configService.healthAltPath;
        },
      }));

      app.use(configService.authRateLimitPath, rateLimit({
        windowMs: configService.authRateLimitWindowMs,
        max: configService.authRateLimitMax,
        message: configService.authRateLimitMessage,
        standardHeaders: true,
        legacyHeaders: false,
      }));
    }

    if (configService.isProduction) {
      app.set('trust proxy', 1);
    }

    this.logger.logServerAction('Security middleware configured', {
      helmet: true,
      rateLimiting: configService.isProduction,
      trustProxy: configService.isProduction,
    });
  }

  private configurePerformanceMiddleware(app: NestExpressApplication, configService: ConfigService): void {
    app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: configService.compressionLevel,
      threshold: configService.compressionThreshold,
    }));

    app.use((req, res, next) => {
      res.setTimeout(configService.responseTimeoutMs, () => {
        res.status(408).json({
          error: configService.timeoutError,
          message: configService.timeoutMessage,
        });
      });
      next();
    });

    this.logger.logServerAction('Performance middleware configured', {
      compression: true,
      timeout: `${configService.responseTimeoutMs / 1000}s`,
    });
  }

  private configureGlobalFilters(app: NestExpressApplication): void {
    app.useGlobalFilters(
      new AllExceptionsFilter(),
      new HttpExceptionFilter(this.logger),
    );

    this.logger.logServerAction('Global exception filters configured');
  }

  private configureApiVersioning(app: NestExpressApplication): void {
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });

    this.logger.logServerAction('API versioning configured', {
      type: 'URI',
      defaultVersion: '1',
      prefix: 'v',
    });
  }

  private configureCors(app: NestExpressApplication, configService: ConfigService): void {
    if (configService.shouldEnableCors) {
      const corsOptions = configService.corsOptions();
      app.enableCors(corsOptions);
      this.logger.logServerAction('CORS configuration enabled', {
        origins: configService.corsOrigins,
        credentials: corsOptions.credentials,
        methods: corsOptions.methods,
      });
    } else {
      this.logger.logServerAction('CORS configuration disabled for production');
    }
  }


  private configureSwagger(app: NestExpressApplication, configService: ConfigService): void {
    if (!configService.shouldEnableSwagger) {
      this.logger.logServerAction('Swagger documentation disabled', {
        environment: configService.environment,
      });
      return;
    }

    const swaggerConfig = configService.swaggerConfig;
    const config = new DocumentBuilder()
      .setTitle(swaggerConfig.title)
      .setDescription(swaggerConfig.description)
      .setVersion(swaggerConfig.version)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API Key for external integrations',
        },
        'api-key',
      )
      .addServer(
        configService.swaggerServerUrl,
        'Development server',
      )
      .addTag('Authentication', 'User authentication and authorization')
      .addTag('Users', 'User management operations')
      .addTag('Health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) =>
        `${controllerKey}_${methodKey}`,
    });

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true,
        defaultModelRendering: 'model',
        displayOperationId: false,
        showExtensions: false,
        showCommonExtensions: false,
      },
      customSiteTitle: 'HCW-Home API Documentation',
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #3b82f6; }
        .swagger-ui .info .description { margin: 20px 0; }
        .swagger-ui .scheme-container { background: #f8f9fa; padding: 10px; }
      `,
      customfavIcon: '/favicon.ico',
    });

    // Generate OpenAPI JSON endpoint
    app.use('/api/docs-json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(document);
    });

    this.logger.logServerAction(
      'Swagger documentation configured successfully',
      {
        title: swaggerConfig.title,
        version: swaggerConfig.version,
        endpoint: '/api/docs',
        jsonEndpoint: '/api/docs-json',
      },
    );
  }

  private configureGlobalPrefix(app: NestExpressApplication): void {
    // Enable versioning
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'v',
      defaultVersion: '1',
    });

    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
        { path: '', method: RequestMethod.GET }, // Root path
      ],
    });

    this.logger.logServerAction('Global API prefix configured', {
      prefix: 'api',
      versioning: 'URI-based with v1 default',
      excludedPaths: ['health', 'metrics', ''],
    });
  }
  private async configureSession(app: NestExpressApplication, configService: ConfigService): Promise<void> {
    const sessionConfig: any = {
      secret: configService.jwtSecret,
      resave: false,
      saveUninitialized: false,
      name: 'sessionId',
      cookie: {
        maxAge: configService.sessionTimeoutMs,
        httpOnly: true,
        secure: configService.isProduction,
        sameSite: configService.isProduction ? 'strict' : 'lax',
      },
    };

    // Try Redis session store with timeout and fallback
    let useRedisStore = false;
    let store: any = null;

    if (configService.redisUrl && configService.redisUrl.trim() !== '') {
      try {
        this.logger.logServerAction('Attempting to connect to Redis for session storage...');
        const redisClient = createClient({ url: configService.redisUrl });
        redisClient.on('error', (err) => this.logger.errorServerAction('Redis Client Error', err));

        // Connect with timeout
        await Promise.race([
          redisClient.connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis connection timeout after 5 seconds')), 5000)
          )
        ]);

        store = new RedisStore({
          client: redisClient,
          prefix: 'sess:',
        });
        useRedisStore = true;
        this.logger.logServerAction('Redis session store connected successfully');
      } catch (error) {
        this.logger.errorServerAction('Failed to connect to Redis for sessions', error.message);
        this.logger.logServerAction('Falling back to memory session store');
      }
    } else {
      this.logger.logServerAction('Redis URL not configured, using memory session store');
    }

    const sessionOptions: any = {
      secret: configService.jwtSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: configService.isProduction,
        httpOnly: true,
        maxAge: 1000 * 60 * 60,
        sameSite: 'lax',
      },
    };

    if (useRedisStore && store) {
      sessionOptions.store = store;
    }

    app.use(session(sessionOptions));

    this.logger.logServerAction(`Session store: ${useRedisStore ? 'Redis' : 'Memory'} configured successfully`);
    this.logger.logServerAction('Session configuration applied', {
      secure: sessionConfig.cookie.secure,
      httpOnly: sessionConfig.cookie.httpOnly,
      sameSite: sessionConfig.cookie.sameSite,
      maxAge: `${sessionConfig.cookie.maxAge}ms`,
      store: useRedisStore ? 'Redis' : 'Memory',
    });
  }



  private configureStaticAssets(app: NestExpressApplication): void {
    const uploadsPath = join(__dirname, '..', 'uploads');

    app.useStaticAssets(uploadsPath, {
      prefix: '/uploads/',
      maxAge: 31536000000, // 1 year cache for uploaded files
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        // Security headers for uploaded files
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'");

        // Cache control based on file type
        if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.gif')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });

    this.logger.logServerAction('Static assets configured', {
      path: '/uploads/',
      directory: uploadsPath,
      cacheMaxAge: '1 year',
    });
  }

  private configurePassport(app: NestExpressApplication): void {
    app.use(passport.initialize());
    app.use(passport.session());

    this.logger.logServerAction('Passport authentication configured');
  }

  private setupGracefulShutdown(app: NestExpressApplication): void {
    const gracefulShutdown = async (signal: string) => {
      this.logger.logServerAction(`Received ${signal}. Starting graceful shutdown...`);

      const shutdownTimer = setTimeout(() => {
        this.logger.errorServerAction('Graceful shutdown timeout exceeded. Force killing process.');
        process.exit(1);
      }, this.gracefulShutdownTimeoutMs);

      try {
        try {
          const databaseService = app.get('DatabaseService');
          this.logger.logServerAction('Closing database connections...');
          await databaseService.onModuleDestroy();
        } catch (e) {
        }

        try {
          const mediasoupSessionService = app.get('MediasoupSessionService');
          this.logger.logServerAction('Cleaning up MediaSoup resources...');
          await mediasoupSessionService.onModuleDestroy();
        } catch (e) {
        }

        await app.close();

        clearTimeout(shutdownTimer);
        this.logger.logServerAction('Graceful shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        clearTimeout(shutdownTimer);
        this.logger.errorServerAction('Error during graceful shutdown', error.stack);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.errorServerAction('Unhandled Promise Rejection', String(reason), {
        promise: promise.toString(),
      });
      if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
        process.exit(1);
      }
    });

    process.on('uncaughtException', (error) => {
      this.logger.errorServerAction('Uncaught Exception', error.stack);
      process.exit(1);
    });

    this.logger.logServerAction('Graceful shutdown handlers configured', {
      timeout: `${this.gracefulShutdownTimeoutMs}ms`,
      signals: ['SIGTERM', 'SIGINT'],
    });
  }

  private async startApplication(
    app: NestExpressApplication,
    configService: ConfigService,
  ): Promise<void> {
    const port = configService.port;

    this.logger.logServerAction('Starting HTTP server', {
      port,
      environment: configService.environment,
      processId: process.pid,
      memoryUsage: process.memoryUsage(),
    });

    if (configService.isProduction) {
      // HTTPS enforcement in production
      const sslKey = process.env.SSL_KEY_PATH;
      const sslCert = process.env.SSL_CERT_PATH;
      if (sslKey && sslCert) {
        const fs = require('fs');
        const https = require('https');
        const httpsOptions = {
          key: fs.readFileSync(sslKey),
          cert: fs.readFileSync(sslCert),
        };
        const server = https.createServer(httpsOptions, app.getHttpAdapter().getInstance());
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;
        server.listen(port, '0.0.0.0', () => {
          this.logger.logServerAction('HTTPS server started', { port });
        });
      } else {
        this.logger.warn('SSL cert/key not configured, falling back to HTTP. Set SSL_KEY_PATH and SSL_CERT_PATH for HTTPS.');
        const server = await app.listen(port, '0.0.0.0');
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;
      }
    } else {
      await app.listen(port);
    }

    this.logApplicationInfo(port, configService);
  }

  private logApplicationInfo(port: number, configService: ConfigService): void {
    const baseUrl = `http://localhost:${port}`;
    const apiUrl = `${baseUrl}/api`;

    this.logger.logServerAction(`Application started successfully`, {
      url: apiUrl,
      port,
      environment: configService.environment,
      nodeEnv: process.env.NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      processId: process.pid,
      timestamp: new Date().toISOString(),
    });

    // Log available endpoints
    const endpoints = [
      { name: 'API', url: apiUrl },
      { name: 'Health Check', url: `${baseUrl}/health` },
      { name: 'Metrics', url: `${baseUrl}/metrics` },
    ];

    if (configService.shouldEnableSwagger) {
      endpoints.push(
        { name: 'API Documentation', url: `${baseUrl}/api/docs` },
        { name: 'OpenAPI JSON', url: `${baseUrl}/api/docs-json` },
      );
    }

    endpoints.forEach(endpoint => {
      this.logger.logServerAction(`${endpoint.name} available`, {
        url: endpoint.url,
      });
    });

    if (configService.isDevelopment) {
      this.logger.logServerAction('Development mode features enabled', {
        cors: configService.shouldEnableCors,
        corsOrigins: configService.corsOrigins,
        swagger: configService.shouldEnableSwagger,
        logFormat: configService.logFormat,
        hotReload: true,
        debugMode: true,
      });
    }

    if (configService.isProduction) {
      this.logger.logServerAction(
        'Production mode active - security and performance optimizations enabled',
        {
          corsDisabled: !configService.shouldEnableCors,
          swaggerDisabled: !configService.shouldEnableSwagger,
          errorMessagesDisabled: configService.shouldDisableErrorMessages,
          helmetEnabled: true,
          rateLimitingEnabled: true,
          compressionEnabled: true,
          secureHeaders: true,
          keepAliveEnabled: true,
        },
      );

      this.logger.logServerAction('Production deployment checklist', {
        databaseUrl: !!configService.databaseUrl,
        jwtSecret: !!configService.jwtSecret,
        redisUrl: !!configService.redisUrl,
        serverId: !!configService.serverId,
        mediasoupAnnouncedIp: !!configService.mediasoupAnnouncedIp,
        emailConfiguration: !!(configService.emailSendgridApiKey && configService.emailSenderAddress),
        httpsRecommended: true,
        loadBalancerReady: true,
        monitoringRecommended: true,
      });
    }

    // Log performance metrics
    const memoryUsage = process.memoryUsage();
    this.logger.logServerAction('Initial memory usage', {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
    });
  }
}

// Application entry point
async function bootstrap() {
  try {
    const app = new ApplicationBootstrap();
    await app.bootstrap();
  } catch (error) {
    console.error('Critical error during application bootstrap:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle bootstrap errors
bootstrap().catch((error) => {
  console.error('Unhandled error in bootstrap:', error);
  process.exit(1);
});

export { ApplicationBootstrap };

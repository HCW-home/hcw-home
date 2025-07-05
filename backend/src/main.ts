import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { CustomLoggerService } from './logger/logger.service';
import { Environment } from './config/environment.enum';
import * as passport from 'passport';
import * as session from 'express-session';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

class ApplicationBootstrap {
  private logger: CustomLoggerService;

  async bootstrap(): Promise<void> {
    try {
      // Validate environment before creating app
      this.validateEnvironment();

      const app = await NestFactory.create<NestExpressApplication>(AppModule);

      // Get services after app is fully initialized
      const configService = app.get(ConfigService);
      this.logger = new CustomLoggerService(configService, 'Bootstrap');

      // Use custom logger for the application
      app.useLogger(this.logger);

      // Configure global validation pipe
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );

      this.logger.logServerAction('Application initialization started', {
        environment: configService.environment,
        logFormat: configService.logFormat,
      });

      // Configure application
      this.configureCors(app, configService);
      this.configureSwagger(app, configService);
      this.configureGlobalPrefix(app);
      app.use(
        session({
          secret: 'your-secret',
          resave: false,
          saveUninitialized: true,
          cookie: {
            maxAge:6000000,
          },
        }),
      );
      app.useStaticAssets(join(__dirname, '..', 'uploads'), {
        prefix: '/uploads/',
      });
      this.logger.log('Static files served from /uploads');
      // initialize passpport
      app.use(passport.initialize());
      app.use(passport.session()); 

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
  }

  private configureCors(app: any, configService: ConfigService): void {
    if (configService.shouldEnableCors) {
      app.enableCors({
        origin: configService.corsOrigin,
        credentials: true,
      });

      this.logger.logServerAction('CORS configuration enabled', {
        origin: configService.corsOrigin,
        credentials: true,
      });
    } else {
      this.logger.logServerAction('CORS configuration disabled for production');
    }
  }

  private configureSwagger(app: any, configService: ConfigService): void {
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
      .addServer(
        `http://localhost:${configService.port}/api/v1`,
        'Development server',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'HCW-Home API Documentation',
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #3b82f6; }
      `,
    });

    this.logger.logServerAction(
      'Swagger documentation configured successfully',
      {
        title: swaggerConfig.title,
        version: swaggerConfig.version,
        endpoint: '/api/docs',
      },
    );
  }

  private configureGlobalPrefix(app: any): void {
    app.setGlobalPrefix('api/v1');
    this.logger.logServerAction('Global API prefix configured', {
      prefix: 'api/v1',
    });
  }

  private async startApplication(
    app: any,
    configService: ConfigService,
  ): Promise<void> {
    const port = configService.port;

    this.logger.logServerAction('Starting HTTP server', {
      port,
      environment: configService.environment,
    });

    await app.listen(port);

    this.logApplicationInfo(port, configService);
  }

  private logApplicationInfo(port: number, configService: ConfigService): void {
    this.logger.logServerAction(`Application started successfully on http://localhost:${port}/api/v1`, {
      url: `http://localhost:${port}/api/v1`,
      port,
      environment: configService.environment,
      timestamp: new Date().toISOString(),
    });

    if (configService.shouldEnableSwagger) {
      this.logger.logServerAction('Swagger documentation available', {
        url: `http://localhost:${port}/api/docs`,
      });
    }

    // Log additional info in development
    if (configService.isDevelopment) {
      this.logger.logServerAction('Development mode features enabled', {
        cors: configService.shouldEnableCors,
        corsOrigin: configService.corsOrigin,
        swagger: configService.shouldEnableSwagger,
        logFormat: configService.logFormat,
      });
    }

    // Log production warnings
    if (configService.isProduction) {
      this.logger.logServerAction(
        'Production mode active - security features enabled',
        {
          corsDisabled: !configService.shouldEnableCors,
          swaggerDisabled: !configService.shouldEnableSwagger,
          errorMessagesDisabled: configService.shouldDisableErrorMessages,
        },
      );
    }
  }
}

// Bootstrap the application
async function bootstrap() {
  const app = new ApplicationBootstrap();
  await app.bootstrap();
}

bootstrap();
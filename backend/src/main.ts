// main.ts
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { Environment } from './config/environment.enum';
import * as passport from 'passport';
import * as session from 'express-session';

class ApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  async bootstrap(): Promise<void> {
    try {
      // Validate environment before creating app
      this.validateEnvironment();

      const app = await NestFactory.create(AppModule);

      // Get ConfigService after app is fully initialized
      const configService = app.get(ConfigService);

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
      
      // initialize passpport
      app.use(passport.initialize());
      app.use(passport.session()); 

      // Start application
      await this.startApplication(app, configService);
    } catch (error) {
      this.logger.error('Failed to start application:', error.message);
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
      this.logger.log(`CORS enabled for origin: ${configService.corsOrigin}`);
    }
  }

  private configureSwagger(app: any, configService: ConfigService): void {
    if (!configService.shouldEnableSwagger) {
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

    this.logger.log('Swagger documentation configured');
  }

  private configureGlobalPrefix(app: any): void {
    app.setGlobalPrefix('api/v1');
  }

  private async startApplication(
    app: any,
    configService: ConfigService,
  ): Promise<void> {
    const port = configService.port;
    await app.listen(port);

    this.logApplicationInfo(port, configService);
  }

  private logApplicationInfo(port: number, configService: ConfigService): void {
    this.logger.log(
      `Application is running on: http://localhost:${port}/api/v1`,
    );
    this.logger.log(`Environment: ${configService.environment}`);

    if (configService.shouldEnableSwagger) {
      this.logger.log(`Swagger Docs: http://localhost:${port}/api/docs`);
    }

    // Log additional info in development
    if (configService.isDevelopment) {
      this.logger.log(`Development mode features enabled`);
      this.logger.log(`CORS Origin: ${configService.corsOrigin}`);
    }
  }
}

// Bootstrap the application
async function bootstrap() {
  const app = new ApplicationBootstrap();
  await app.bootstrap();
}

bootstrap();
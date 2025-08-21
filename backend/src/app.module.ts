import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ConsultationModule } from './consultation/consultation.module';
import { UserModule } from './user/user.module';
import { OrganizationModule } from './organization/organization.module';
import { GroupModule } from './group/group.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { MediasoupModule } from './mediasoup/mediasoup.module';

import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SmsProviderModule } from './sms_provider/sms_provider.module';
import { LanguageModule } from './language/language.module';
import { SpecialityModule } from './speciality/speciality.module';
import { ExportModule } from './export/export.module';
import { TermModule } from './term/term.module';
import { LoggerModule } from './logger/logger.module';
import { AvailabilityModule } from './availability/availability.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    ConsultationModule,
    UserModule,
    OrganizationModule,
    GroupModule,
    MediasoupModule,
    SmsProviderModule,
    LanguageModule,
    SpecialityModule,
    ExportModule,
    TermModule,
    AvailabilityModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

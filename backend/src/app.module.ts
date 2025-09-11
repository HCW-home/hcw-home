import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OrganizationModule } from './organization/organization.module';
import { GroupModule } from './group/group.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { MediasoupModule } from './mediasoup/mediasoup.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { APP_INTERCEPTOR, APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SmsProviderModule } from './sms_provider/sms_provider.module';
import { WhatsappTemplateModule } from './whatsapp-template/whatsapp-template.module';
import { LanguageModule } from './language/language.module';
import { SpecialityModule } from './speciality/speciality.module';
import { ExportModule } from './export/export.module';
import { TermModule } from './term/term.module';
import { LoggerModule } from './logger/logger.module';
import { AvailabilityModule } from './availability/availability.module';
import { ReminderModule } from './reminder/reminder.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from './notification/notification.module';
import { CoreModule } from './core/core.module';
import { ChatModule } from './chat/chat.module';
import { ConsultationModule } from './consultation/consultation.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    HealthModule,

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),

    ScheduleModule.forRoot(),
    UserModule,
    AuthModule,
    OrganizationModule,
    GroupModule,
    AvailabilityModule,
    ReminderModule,
    NotificationModule,
    SmsProviderModule,
    WhatsappTemplateModule,
    ChatModule,
    LanguageModule,
    SpecialityModule,
    ExportModule,
    TermModule,
    CoreModule,
    MediasoupModule,
    ConsultationModule,
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
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

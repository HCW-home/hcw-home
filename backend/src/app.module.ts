import { Module, NestModule,MiddlewareConsumer } from '@nestjs/common';
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
import { SmsProviderModule } from './sms_provider/sms_provider.module';


@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    ConsultationModule,
    UserModule,
    OrganizationModule,
    GroupModule,
    MediasoupModule,
    SmsProviderModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
}
}
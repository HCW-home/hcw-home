import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { RemindersModule } from './reminders/reminders.module';
import { BullModule } from './bull/bull.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    DatabaseModule,
    HealthModule,
    ConsultationsModule,
    RemindersModule,
    BullModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
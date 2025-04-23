import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ConsultationModule } from './consultation/consultation.module';
import { OrganisationModule } from './organisation/organisation.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),  // Specify 'jwt' as the default strategy
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UserModule,
    ConsultationModule,
    OrganisationModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
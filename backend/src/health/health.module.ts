import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { HealthV1Controller } from './health-v1.controller';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [HealthService],
  controllers: [HealthController, HealthV1Controller],
})
export class HealthModule { }

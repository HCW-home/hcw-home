import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  providers: [NotificationService],
  controllers: [NotificationController],
  imports: [AuthModule],
})
export class NotificationModule {}

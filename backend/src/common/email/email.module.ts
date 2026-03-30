import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ConfigModule } from 'src/config/config.module';
@Module({
  imports: [ConfigModule],
  providers: [EmailService],
  exports: [EmailService], 
})
export class EmailModule {}

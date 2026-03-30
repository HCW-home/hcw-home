import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { ConfigModule } from 'src/config/config.module';
import { StorageModule } from 'src/storage/storage.module';
import { EmailService } from 'src/common/email/email.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    StorageModule,
  ],
  providers: [
    EmailService,
  ],
  exports: [
    EmailService,
    DatabaseModule,
    ConfigModule,
    StorageModule,
  ],
})
export class CoreModule { }

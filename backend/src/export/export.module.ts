import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {} 
import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  controllers: [UserController],
  providers: [UserService],
  imports: [DatabaseModule],
  exports: [UserService], // 👈 Export UserService
})
export class UserModule {}

import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { DatabaseModule } from 'src/database/database.module';
import { CoreModule } from '../core/core.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [UserController],
  providers: [UserService],
  imports: [DatabaseModule, CoreModule, AuthModule],
  exports: [UserService],
})
export class UserModule { }

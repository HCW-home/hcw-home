import { Module } from '@nestjs/common';
import { TermService } from './term.service';
import { TermController } from './term.controller';
import { PublicTermController } from './public-term.controller';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';

@Module({
  providers: [TermService],
  controllers: [TermController, PublicTermController],
  imports: [AuthModule, UserModule]
})
export class TermModule { }

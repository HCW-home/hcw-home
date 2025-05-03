import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { ConsultationModule } from '../consultation/consultation.module';

@Module({
  imports: [
    ConsultationModule,
  ],
  controllers: [PublicController],
})
export class PublicModule {}
import { Module } from '@nestjs/common';
import { SpecialityService } from './speciality.service';
import { SpecialityController } from './speciality.controller';

@Module({
  controllers: [SpecialityController],
  providers: [SpecialityService],
})
export class SpecialityModule {}

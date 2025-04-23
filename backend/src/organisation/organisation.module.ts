import { Module } from '@nestjs/common';
import { OrganisationConstroller } from './organisation.controller';
import { OrganisationService } from './organisation.service';

@Module({
  controllers: [OrganisationConstroller],
  providers: [OrganisationService],
  exports: [OrganisationService],
})
export class OrganisationModule {}
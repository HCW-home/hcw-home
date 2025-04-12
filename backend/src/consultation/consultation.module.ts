import { Module } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationController } from './consultation.controller';
import { ConsultationGateway } from './consultation.gateway';
import { PrismaService } from '../prisma.service'; // ✅ correct relative import

@Module({
  providers: [ConsultationService, ConsultationGateway, PrismaService], // ✅ add PrismaService here
  controllers: [ConsultationController]
})
export class ConsultationModule {}

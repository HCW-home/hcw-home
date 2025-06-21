import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ExportConsultationsDto } from './dto/export-consultations.dto';
import { CsvUtil } from './utils/csv.util';
import { Prisma, UserRole } from '@prisma/client';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly db: DatabaseService) {}

  async exportConsultationsAsCsv(
    filters: ExportConsultationsDto,
  ): Promise<string> {
    this.logger.log(
      `Starting CSV export process with filters: ${JSON.stringify(filters)}`,
    );

    const where = this.buildWhereClause(filters);

    const consultations = await this.db.consultation.findMany({
      where,
      include: {
        participants: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (consultations.length === 0) {
      this.logger.log('No consultations found for the given filters.');
      return 'No consultations found for the selected criteria.';
    }

    const formattedData = consultations.map((consultation) => {
      const practitioner = consultation.participants.find(
        (p) => p.user.role === UserRole.PRACTITIONER,
      )?.user;
      const patient = consultation.participants.find(
        (p) => p.user.role === UserRole.PATIENT,
      )?.user;

      return {
        'Consultation ID': consultation.id,
        'Status': consultation.status,
        'Scheduled Date': consultation.scheduledDate?.toISOString() ?? 'N/A',
        'Created At': consultation.createdAt?.toISOString() ?? 'N/A',
        'Started At': consultation.startedAt?.toISOString() ?? 'N/A',
        'Closed At': consultation.closedAt?.toISOString() ?? 'N/A',
        'Practitioner Name': practitioner
          ? `${practitioner.firstName} ${practitioner.lastName}`
          : 'N/A',
        'Practitioner Email': practitioner?.email ?? 'N/A',
        'Patient Name': patient
          ? `${patient.firstName} ${patient.lastName}`
          : 'N/A',
        'Patient Email': patient?.email ?? 'N/A',
      };
    });

    return CsvUtil.toCsv(formattedData);
  }

  private buildWhereClause(
    filters: ExportConsultationsDto,
  ): Prisma.ConsultationWhereInput {
    const where: Prisma.ConsultationWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.createdAt.lte = new Date(filters.dateTo);
      }
    }

    if (filters.practitionerId) {
      where.participants = {
        some: {
          userId: filters.practitionerId,
          user: {
            role: UserRole.PRACTITIONER,
          },
        },
      };
    }

    return where;
  }
} 
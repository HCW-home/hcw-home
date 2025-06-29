import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from 'src/config/config.service';

@Injectable()
export class ConsultationCleanupService {
  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredConsultations() {
    const retentionHours = this.configService.consultationRetentionHours;
    const bufferHours = this.configService.consultationDeletionBufferHours;

    // Calculate cutoff time (retention + buffer)
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - (retentionHours + bufferHours));

    try {
      // Find consultations scheduled for deletion
      const consultationsToDelete = await this.db.consultation.findMany({
        where: {
          status: {
            in: [
              ConsultationStatus.COMPLETED,
              ConsultationStatus.TERMINATED_OPEN,
            ],
          },
          deletionScheduledAt: {
            lte: cutoffDate,
          },
          isDeleted: false,
        },
      });

      // Early return if nothing to delete
      if (consultationsToDelete.length === 0) {
        console.log('No expired consultations found for cleanup.');
        return;
      }

      const consultationIds = consultationsToDelete.map((c) => c.id);

      // Perform soft-delete
      const updateResult = await this.db.consultation.updateMany({
        where: {
          id: {
            in: consultationIds,
          },
        },
        data: {
          isDeleted: true,
        },
      });

      // Audit log the deletions
      await this.db.deletedConsultationLog.createMany({
        data: consultationsToDelete.map((c) => ({
          consultationId: c.id,
          deletedAt: new Date(),
          reason: 'Auto-cleanup after expiration',
        })),
      });

      console.log(`Soft-deleted ${updateResult.count} expired consultations`);
    } catch (error) {
      console.error('Failed to soft-delete expired consultations:', error);
    }
  }
}

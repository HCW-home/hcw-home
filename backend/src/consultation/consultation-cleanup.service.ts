import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ConsultationStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from 'src/config/config.service';
import { MediasoupSessionService } from 'src/mediasoup/mediasoup-session.service';

@Injectable()
export class ConsultationCleanupService {
  private readonly logger = new Logger(ConsultationCleanupService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly mediasoupSessionService: MediasoupSessionService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredConsultations() {
    const retentionHours = this.configService.consultationRetentionHours;
    const bufferHours = this.configService.consultationDeletionBufferHours;

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - (retentionHours + bufferHours));

    try {
      // Find expired, not-yet-deleted consultations
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

      if (consultationsToDelete.length === 0) {
        this.logger.log('No expired consultations found for cleanup.');
        return;
      }

      const consultationIds = consultationsToDelete.map((c) => c.id);

      // --- Mediasoup router/session cleanup! (most important addition) ---
      for (const consultId of consultationIds) {
        try {
          await this.mediasoupSessionService.cleanupRouterForConsultation(
            consultId,
          );
          this.logger.log(
            `Mediasoup router cleaned for expired consultation ${consultId}`,
          );
        } catch (err) {
          this.logger.error(
            `Failed Mediasoup router cleanup for consultation ${consultId}: ${err?.message || err}`,
          );
        }
      }

      // --- Perform soft-delete ---
      const updateResult = await this.db.consultation.updateMany({
        where: { id: { in: consultationIds } },
        data: { isDeleted: true },
      });

      // --- Audit log the deletions ---
      await this.db.deletedConsultationLog.createMany({
        data: consultationsToDelete.map((c) => ({
          consultationId: c.id,
          deletedAt: new Date(),
          reason: 'Auto-cleanup after expiration',
        })),
      });

      this.logger.log(
        `Soft-deleted ${updateResult.count} expired consultations`,
      );
      const hangingTimeoutMs = 2 * 60 * 60 * 1000; // 2 hours

      const oldTransports = await this.db.mediasoupTransport.findMany({
        where: {
          createdAt: { lt: new Date(Date.now() - hangingTimeoutMs) },
        },
      });

      for (const transport of oldTransports) {
        try {
          await this.mediasoupSessionService.closeTransport(transport.id);
          this.logger.log(
            `Closed hanging transport ${transport.id} during cleanup`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to close hanging transport ${transport.id}: ${err?.message || err}`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to soft-delete expired consultations:', error);
    }
  }
}

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DatabaseService');
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit() {
    try {
      this.logger.log('🔗 Attempting to connect to database...');

      const connectWithTimeout = () => {
        return Promise.race([
          this.$connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database connection timeout after 5 seconds')), 5000)
          )
        ]);
      };

      await connectWithTimeout();
      this.logger.log('✅ Database connection established successfully');
    } catch (error) {
      this.logger.error('❌ Database connection failed:', error.message);
      this.logger.warn('⚠️ Application will continue in offline mode');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}

import { INestApplication, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('Database connection closed');
  }

  // preventing zombie processes (clean shutdown)
  async enableShutdownHooks(app: INestApplication) {
    // @ts-ignore - Prisma's $on method has type issues
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}

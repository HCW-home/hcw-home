import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { DatabaseService } from 'src/database/database.service';
import { createClient, RedisClientType } from 'redis';
import { ConfigService } from 'src/config/config.service';
import { v4 as uuidv4 } from 'uuid';

type RouterEntry = {
  router: mediasoup.types.Router;
  workerPid: number;
  correlationId: string;
};

@Injectable()
export class MediasoupSessionService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(MediasoupSessionService.name);

  private workers: mediasoup.types.Worker[] = [];
  private routers: Map<number, RouterEntry> = new Map();
  private transports: Map<string, mediasoup.types.Transport> = new Map();
  private producers: Map<string, mediasoup.types.Producer> = new Map();
  private consumers: Map<string, mediasoup.types.Consumer> = new Map();
  private workerRouterCount: Map<number, number> = new Map();
  private connectionStats: Map<string, any> = new Map();

  private redisPublisher: RedisClientType | null = null;
  private redisSubscriber: RedisClientType | null = null;
  private isRedisConfigured: boolean = false;

  private readonly serverId: string;
  private readonly serverLoad: Map<string, number> = new Map();

  private readonly sessionTimeoutMs = 5 * 60 * 1000;
  private readonly consultationRouterLocks: Map<number, Promise<any>> = new Map();
  scalingThresholdLow: number;
  scalingThresholdHigh: number;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.serverId = this.configService.serverId;

    // Environment-aware scaling thresholds
    const isDevelopment = this.configService.isDevelopment;
    this.scalingThresholdLow = isDevelopment ? 1 : 2;
    this.scalingThresholdHigh = isDevelopment ? 4 : 8;
  }

  async onModuleInit(): Promise<void> {
    const isDevelopment = this.configService.isDevelopment;

    this.logger.log(`🚀 Starting MediaSoup Session Service in ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);

    await this.initializeWorkers();

    // Try to initialize Redis, but don't fail if it's not available
    try {
      await this.initRedis();
    } catch (error) {
      if (isDevelopment) {
        this.logger.warn('⚠️  Redis initialization failed - MediaSoup will work in standalone mode');
        this.logger.warn('💻 Perfect for development! Multi-server load balancing disabled');
      } else {
        this.logger.error('❌ Redis initialization failed in production environment');
        this.logger.error('🔧 Multi-server load balancing disabled - this may impact performance');
      }
      this.logger.debug('Redis error details:', error);
    }

    // Environment-aware monitoring intervals
    const cleanupInterval = isDevelopment ? 120 * 1000 : 60 * 1000; // 2 min dev, 1 min prod
    const monitoringInterval = isDevelopment ? 60 * 1000 : 30 * 1000; // 1 min dev, 30s prod

    setInterval(() => this.cleanupInactiveSessions(), cleanupInterval);
    setInterval(() => this.monitorAndScaleWorkers(), monitoringInterval);

    this.logger.log(`✅ MediaSoup Session Service initialized successfully`);
    this.logger.log(`📊 Cleanup interval: ${cleanupInterval / 1000}s, Monitoring interval: ${monitoringInterval / 1000}s`);
  }

  private logStructured(
    level: 'log' | 'error' | 'warn' | 'verbose',
    message: string,
    meta: Record<string, any> = {},
  ) {
    if (level === 'verbose' && process.env.NODE_ENV !== 'production') return;
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'mediasoup-session',
      ...meta,
      message,
    };
    switch (level) {
      case 'error':
        this.logger.error(JSON.stringify(logEntry));
        break;
      case 'warn':
        this.logger.warn(JSON.stringify(logEntry));
        break;
      case 'verbose':
        this.logger.verbose(JSON.stringify(logEntry));
        break;
      default:
        this.logger.log(JSON.stringify(logEntry));
    }
  }

  private async initRedis() {
    const redisUrl = this.configService.redisUrl;
    const isDevelopment = this.configService.isDevelopment;

    // In development, Redis is optional for single-server operation
    if (isDevelopment && (!redisUrl || redisUrl.trim() === '')) {
      this.logger.log('🔧 Development mode: Running without Redis (single-server mode)');
      this.logger.log('✅ Multi-server load balancing disabled - perfect for development');
      this.isRedisConfigured = false;
      return;
    }

    // Check if Redis URL is properly configured for production
    if (!redisUrl || redisUrl.includes('your-redis-url')) {
      const message = isDevelopment
        ? '⚠️  Redis URL not configured - running in single-server mode'
        : '❌ Redis URL not configured - required for production multi-server setup';

      this.logger.warn(message);
      this.isRedisConfigured = false;

      if (!isDevelopment) {
        throw new Error('Redis URL is required for production multi-server deployment');
      }
      return;
    }

    this.logger.log(`🔄 Initializing Redis connections for ${isDevelopment ? 'development' : 'production'} environment...`);

    this.redisPublisher = createClient({ url: redisUrl });
    this.redisSubscriber = createClient({ url: redisUrl });

    this.redisPublisher.on('error', (err) => {
      this.logger.error('Redis Publisher error', err);
      this.isRedisConfigured = false;
    });

    this.redisSubscriber.on('error', (err) => {
      this.logger.error('Redis Subscriber error', err);
      this.isRedisConfigured = false;
    });

    // Set connection timeout
    const connectionTimeout = 5000; // 5 seconds

    try {
      await Promise.race([
        this.redisPublisher.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis connection timeout')),
            connectionTimeout,
          ),
        ),
      ]);

      await Promise.race([
        this.redisSubscriber.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis connection timeout')),
            connectionTimeout,
          ),
        ),
      ]);

      await this.redisSubscriber.subscribe(
        'mediasoup:load:update',
        (message) => {
          try {
            const parsed = JSON.parse(message);
            this.serverLoad.set(parsed.serverId, parsed.load);
            this.logStructured('verbose', 'Received load update', {
              serverId: parsed.serverId,
              load: parsed.load,
            });
          } catch (err) {
            this.logger.error('Failed to parse Redis load update message', err);
          }
        },
      );

      // Subscribe to router lifecycle events for cross-server coordination
      await this.redisSubscriber.subscribe(
        'mediasoup:router:created',
        (message) => {
          try {
            const parsed = JSON.parse(message);
            if (parsed.serverId !== this.serverId) {
              this.logStructured('verbose', 'Router created on another server', {
                consultationId: parsed.consultationId,
                routerId: parsed.routerId,
                remoteServerId: parsed.serverId,
              });
            }
          } catch (err) {
            this.logger.error('Failed to parse Redis router created message', err);
          }
        },
      );

      await this.redisSubscriber.subscribe(
        'mediasoup:router:closed',
        (message) => {
          try {
            const parsed = JSON.parse(message);
            if (parsed.serverId !== this.serverId) {
              this.logStructured('verbose', 'Router closed on another server', {
                consultationId: parsed.consultationId,
                routerId: parsed.routerId,
                remoteServerId: parsed.serverId,
              });
            }
          } catch (err) {
            this.logger.error('Failed to parse Redis router closed message', err);
          }
        },
      );

      this.isRedisConfigured = true;
      this.logger.log('✅ Redis connections established successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      this.isRedisConfigured = false;

      // Clean up failed connections
      if (this.redisPublisher) {
        try {
          await this.redisPublisher.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        this.redisPublisher = null;
      }

      if (this.redisSubscriber) {
        try {
          await this.redisSubscriber.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        this.redisSubscriber = null;
      }

      throw error; // Re-throw to be caught by onModuleInit
    }

    // Start broadcasting load updates if Redis is configured
    if (this.isRedisConfigured) {
      setInterval(() => this.broadcastLoad(), 5000);
    }
  }

  private async broadcastLoad() {
    if (!this.isRedisConfigured || this.redisPublisher === null) {
      // Redis is not configured, skip broadcasting
      return;
    }

    const totalRouters = Array.from(this.workerRouterCount.values()).reduce(
      (a, b) => a + b,
      0,
    );
    const msg = JSON.stringify({ serverId: this.serverId, load: totalRouters });

    try {
      await this.redisPublisher.publish('mediasoup:load:update', msg);
      this.logStructured('verbose', 'Broadcasted load', {
        serverId: this.serverId,
        load: totalRouters,
      });
    } catch (err) {
      this.logStructured('error', 'Failed to publish load', {
        error: err.message,
      });
    }
  }

  async getLeastLoadedServer(): Promise<string> {
    if (this.serverLoad.size === 0) return this.serverId;

    let minLoad = Number.MAX_SAFE_INTEGER;
    let bestServer = this.serverId;
    for (const [serverId, load] of this.serverLoad.entries()) {
      if (load < minLoad) {
        minLoad = load;
        bestServer = serverId;
      }
    }
    this.logStructured('verbose', 'Selected least loaded server', {
      selectedServer: bestServer,
      load: minLoad,
    });
    return bestServer;
  }

  private async initializeWorkers() {
    // Environment-aware worker configuration
    const isDevelopment = this.configService.isDevelopment;
    const numWorkers = isDevelopment ? 2 : 4; // Fewer workers for development

    this.logger.log(`🚀 Initializing ${numWorkers} MediaSoup workers for ${isDevelopment ? 'development' : 'production'} environment`);

    for (let i = 0; i < numWorkers; i++) {
      await this.addWorker();
    }

    this.logger.log(`✅ Successfully initialized ${this.workers.length} MediaSoup workers`);
  }

  private async addWorker() {
    try {
      const isDevelopment = this.configService.isDevelopment;

      const worker = await mediasoup.createWorker({
        logLevel: isDevelopment ? 'debug' : 'warn',
        rtcMinPort: 40000,
        rtcMaxPort: 49999,
      });

      worker.on('died', () => {
        this.logStructured('error', `Worker died, will restart`, {
          pid: worker.pid,
          environment: isDevelopment ? 'development' : 'production'
        });
        this.removeWorker(worker.pid);
        this.addWorker().catch((e) => {
          this.logStructured(
            'error',
            `Failed to restart worker: ${e.message}`,
            {},
          );
        });
      });

      this.workers.push(worker);
      this.workerRouterCount.set(worker.pid, 0);
      this.logStructured('log', 'Worker added', {
        pid: worker.pid,
        totalWorkers: this.workers.length,
        environment: isDevelopment ? 'development' : 'production'
      });
    } catch (error) {
      this.logStructured('error', 'Failed to add mediasoup worker', {
        error: error.message,
      });
    }
  }

  private async _removeWorkerAndCleanup(pid: number) {
    const workerIndex = this.workers.findIndex((w) => w.pid === pid);
    if (workerIndex === -1) return;

    for (const [consultationId, routerEntry] of this.routers.entries()) {
      if (routerEntry.workerPid === pid) {
        await this.cleanupRouterForConsultation(consultationId);
      }
    }

    try {
      await this.workers[workerIndex].close();
      this.logStructured('log', 'Worker closed', { pid });
    } catch (err) {
      this.logStructured('error', 'Error closing worker', {
        pid,
        error: err.message,
      });
    }

    this.workers.splice(workerIndex, 1);
    this.workerRouterCount.delete(pid);
    this.logStructured('log', 'Worker removed', { pid });
  }

  async removeIdleWorkers(minActiveRouters = 1) {
    for (const worker of this.workers) {
      const activeRouters = this.workerRouterCount.get(worker.pid) ?? 0;
      if (activeRouters <= minActiveRouters) {
        this.logStructured('log', 'Removing idle worker', {
          pid: worker.pid,
          activeRouters,
        });
        await this._removeWorkerAndCleanup(worker.pid);
        break;
      }
    }
  }

  async scaleWorkers(targetCount: number) {
    const currentCount = this.workers.length;
    if (targetCount > currentCount) {
      while (this.workers.length < targetCount) {
        await this.addWorker();
      }
    } else if (targetCount < currentCount) {
      while (this.workers.length > targetCount) {
        await this.removeIdleWorkers();
      }
    }
  }

  private removeWorker(pid: number) {
    const index = this.workers.findIndex((w) => w.pid === pid);
    if (index !== -1) {
      this.workers.splice(index, 1);
      this.workerRouterCount.delete(pid);
      this.logStructured('log', 'Worker removed (removeWorker)', { pid });
    }
  }

  private getLeastLoadedWorker(): mediasoup.types.Worker | null {
    if (this.workers.length === 0) {
      this.logStructured('error', 'No mediasoup workers available');
      return null;
    }

    let leastLoadedWorker = this.workers[0];
    let minLoad = this.workerRouterCount.get(leastLoadedWorker.pid) ?? 0;

    for (const worker of this.workers) {
      const load = this.workerRouterCount.get(worker.pid) ?? 0;
      if (load < minLoad) {
        leastLoadedWorker = worker;
        minLoad = load;
      }
    }
    this.logStructured('verbose', 'Selected least loaded worker', {
      pid: leastLoadedWorker.pid,
      routerCount: minLoad,
    });
    return leastLoadedWorker;
  }

  async createRouterForConsultation(consultationId: number) {
    // Prevent concurrent router creation for the same consultation
    const existingLock = this.consultationRouterLocks.get(consultationId);
    if (existingLock) {
      this.logger.warn(`Router creation already in progress for consultation ${consultationId}, waiting...`);
      return await existingLock;
    }

    const creationPromise = this._createRouterForConsultationInternal(consultationId);
    this.consultationRouterLocks.set(consultationId, creationPromise);

    try {
      const router = await creationPromise;
      return router;
    } finally {
      this.consultationRouterLocks.delete(consultationId);
    }
  }

  private async _createRouterForConsultationInternal(consultationId: number) {
    const correlationId = uuidv4();
    this.logStructured('log', 'Creating router for consultation', {
      consultationId,
      correlationId,
      serverId: this.serverId,
    });

    const existingRouter = await this.databaseService.mediasoupRouter.findUnique({
      where: { consultationId },
    });
    if (existingRouter) {
      this.logStructured('warn', 'Router already exists for consultation in database', {
        consultationId,
        routerId: existingRouter.routerId,
        serverId: existingRouter.serverId,
      });
      // Only re-create mediasoup router in memory if not present
      if (!this.routers.has(consultationId)) {
        this.logStructured('log', 'Router exists in DB but not in memory, will recreate', {
          consultationId,
          routerId: existingRouter.routerId,
        });

        // Delete the stale DB entry first to avoid unique constraint violation
        try {
          await this.databaseService.mediasoupRouter.delete({
            where: { consultationId },
          });
          this.logStructured('log', 'Deleted stale router DB entry before recreation', {
            consultationId,
            routerId: existingRouter.routerId,
          });
        } catch (deleteError) {
          this.logStructured('warn', 'Failed to delete stale router DB entry', {
            consultationId,
            error: deleteError.message,
          });
        }

        // Now proceed to create a fresh router (fall through to regular creation logic below)
      } else {
        // Return the existing router from memory
        const existingRouterEntry = this.routers.get(consultationId);
        if (existingRouterEntry) {
          this.logStructured('log', 'Using existing router from memory', {
            consultationId,
            routerId: existingRouterEntry.router.id,
          });
          return existingRouterEntry.router;
        }
      }
    }

    const worker = this.getLeastLoadedWorker();
    if (!worker) {
      const error = 'No available mediasoup worker found';
      this.logStructured('error', error, { consultationId, correlationId });
      throw new Error(error);
    }

    // Environment-aware server selection
    let preferredServerId = this.serverId;

    // Only use Redis load balancing in production or when Redis is configured
    if (this.isRedisConfigured) {
      try {
        preferredServerId = await this.getLeastLoadedServer();
        this.logStructured('log', 'Using load-balanced server selection', {
          consultationId,
          selectedServerId: preferredServerId,
          currentServerId: this.serverId,
        });
      } catch (error) {
        this.logStructured('warn', 'Load balancing failed, using current server', {
          consultationId,
          error: error.message,
          fallbackServerId: this.serverId,
        });
      }
    }

    let server = await this.databaseService.mediasoupServer.findUnique({
      where: { id: preferredServerId },
    });

    if (!server) {
      try {
        server = await this.databaseService.mediasoupServer.create({
          data: {
            id: preferredServerId,
            url: this.configService.isDevelopment
              ? 'http://localhost:3000'
              : `http://${preferredServerId}:3000`,
            username: this.configService.isDevelopment ? 'dev_user' : 'mediasoup_user',
            password: this.configService.isDevelopment ? 'dev_password' : 'secure_password',
            active: true,
          },
        });
        this.logStructured('log', 'Created new server record', {
          consultationId,
          serverId: preferredServerId,
          environment: this.configService.isDevelopment ? 'development' : 'production',
        });
      } catch (dbError) {
        this.logStructured('error', 'Failed to create server record', {
          consultationId,
          serverId: preferredServerId,
          error: dbError.message,
        });
        throw new Error('Unable to initialize server record for MediaSoup routing');
      }
    }

    if (!server.active) {
      const error = `MediaSoup server ${preferredServerId} is not active`;
      this.logStructured('error', error, { consultationId, correlationId });
      throw new Error(error);
    }

    // Create MediaSoup router with environment-aware configuration
    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: { 'x-google-start-bitrate': this.configService.isDevelopment ? 500 : 1000 },
        },
        {
          kind: 'video',
          mimeType: 'video/H264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': this.configService.isDevelopment ? 500 : 1000,
          },
        },
      ] as mediasoup.types.RtpCodecCapability[],
    });

    router.observer.on('close', () => {
      this.logStructured('log', 'Router closed', {
        consultationId,
        correlationId,
        routerId: router.id,
      });
    });

    try {
      // First, check if a router already exists for this consultation
      const existingRouter = await this.databaseService.mediasoupRouter.findUnique({
        where: { consultationId },
      });

      if (existingRouter) {
        // Router exists in DB, delete the stale entry first
        this.logStructured('warn', 'Router already exists for consultation in database, deleting stale entry', {
          consultationId,
          existingRouterId: existingRouter.routerId,
          newRouterId: router.id,
        });

        await this.databaseService.mediasoupRouter.delete({
          where: { consultationId },
        });
      }

      // Now create the new router entry
      await this.databaseService.mediasoupRouter.create({
        data: {
          consultationId,
          routerId: router.id,
          serverId: server.id,
        },
      });

      this.logStructured('log', 'Router stored in database successfully', {
        consultationId,
        routerId: router.id,
        serverId: server.id,
      });
    } catch (dbError) {
      // If database insertion fails, clean up the router
      try {
        await router.close();
      } catch (closeError) {
        this.logStructured('error', 'Failed to close router after DB error', {
          consultationId,
          error: closeError.message,
        });
      }

      this.logStructured('error', 'Failed to store router in database', {
        consultationId,
        error: dbError.message,
      });
      throw dbError;
    }

    // Store router in memory
    this.routers.set(consultationId, {
      router,
      workerPid: worker.pid,
      correlationId,
    });

    this.workerRouterCount.set(
      worker.pid,
      (this.workerRouterCount.get(worker.pid) ?? 0) + 1,
    );

    this.logStructured('log', 'Router created successfully for consultation', {
      consultationId,
      workerPid: worker.pid,
      routerId: router.id,
      serverId: server.id,
      correlationId,
      environment: this.configService.isDevelopment ? 'development' : 'production',
    });

    // Broadcast router creation to other servers via Redis (if configured)
    if (this.isRedisConfigured && this.redisPublisher) {
      try {
        await this.redisPublisher.publish('mediasoup:router:created', JSON.stringify({
          consultationId,
          routerId: router.id,
          serverId: this.serverId,
          timestamp: new Date().toISOString(),
        }));
      } catch (redisError) {
        this.logStructured('warn', 'Failed to broadcast router creation', {
          consultationId,
          error: redisError.message,
        });
      }
    }

    return router;
  }

  async cleanupRouterForConsultation(consultationId: number) {
    const entry = this.routers.get(consultationId);
    if (!entry) {
      this.logStructured(
        'warn',
        'No router found for consultation to cleanup',
        {
          consultationId,
        },
      );

      // Check if router exists in database but not in memory and clean it up
      try {
        const dbRouter = await this.databaseService.mediasoupRouter.findUnique({
          where: { consultationId },
        });

        if (dbRouter) {
          await this.databaseService.mediasoupRouter.delete({
            where: { consultationId },
          });
          this.logStructured('log', 'Cleaned up orphaned router record from database', {
            consultationId,
            routerId: dbRouter.routerId,
          });
        }
      } catch (dbError) {
        this.logStructured('warn', 'Failed to clean up orphaned router record', {
          consultationId,
          error: dbError.message,
        });
      }

      return;
    }

    const { router, workerPid, correlationId } = entry;

    try {
      // Close router and update worker count
      await router.close();
      this.routers.delete(consultationId);
      this.workerRouterCount.set(
        workerPid,
        Math.max(0, (this.workerRouterCount.get(workerPid) ?? 1) - 1),
      );

      // Remove from database
      try {
        await this.databaseService.mediasoupRouter.delete({
          where: { consultationId },
        });
      } catch (dbError) {
        this.logStructured('warn', 'Failed to remove router from database', {
          consultationId,
          error: dbError.message,
        });
      }

      // Broadcast router cleanup to other servers via Redis (if configured)
      if (this.isRedisConfigured && this.redisPublisher) {
        try {
          await this.redisPublisher.publish('mediasoup:router:closed', JSON.stringify({
            consultationId,
            routerId: router.id,
            serverId: this.serverId,
            timestamp: new Date().toISOString(),
          }));
        } catch (redisError) {
          this.logStructured('warn', 'Failed to broadcast router cleanup', {
            consultationId,
            error: redisError.message,
          });
        }
      }

      this.logStructured('log', 'Router cleaned up successfully for consultation', {
        consultationId,
        routerId: router.id,
        workerPid,
        correlationId,
      });
    } catch (error) {
      this.logStructured('error', 'Failed to cleanup router', {
        consultationId,
        error: error.message,
        correlationId,
      });
    }
  }

  getRouter(consultationId: number): mediasoup.types.Router | undefined {
    return this.routers.get(consultationId)?.router;
  }

  /**
   * Ensures a router exists for the consultation, creating one if it doesn't exist
   * Enhanced with recovery logic for robust operation
   */
  async ensureRouterForConsultation(
    consultationId: number,
  ): Promise<mediasoup.types.Router> {
    try {
      // Check if router already exists in memory
      let existingRouter = this.getRouter(consultationId);
      if (existingRouter && !existingRouter.closed) {
        this.logStructured(
          'verbose',
          'Router already exists and is active for consultation',
          {
            consultationId,
            routerId: existingRouter.id,
          },
        );
        return existingRouter;
      }

      // If router exists but is closed, clean it up
      if (existingRouter && existingRouter.closed) {
        this.logStructured(
          'warn',
          'Found closed router, cleaning up before recreating',
          {
            consultationId,
          },
        );
        await this.cleanupRouterForConsultation(consultationId);
      }

      // Check if router exists in database but not in memory (e.g., after server restart)
      const dbRouter = await this.databaseService.mediasoupRouter.findUnique({
        where: { consultationId },
        include: { server: true },
      });

      if (dbRouter?.server?.active) {
        // Router exists in DB but not in memory, need to recreate it
        this.logStructured(
          'log',
          'Router exists in DB but not in memory, will recreate',
          {
            consultationId,
            routerId: dbRouter.routerId,
            serverId: dbRouter.serverId,
          },
        );

        // Clean up the stale DB entry first to avoid unique constraint errors
        try {
          await this.databaseService.mediasoupRouter.delete({
            where: { consultationId },
          });
          this.logStructured('log', 'Deleted stale router DB entry before recreation', {
            consultationId,
            routerId: dbRouter.routerId,
          });
        } catch (dbError) {
          this.logStructured('warn', 'Failed to delete stale router DB entry', {
            consultationId,
            error: dbError.message,
          });
        }
      }

      // Create new router with retry logic
      let router: mediasoup.types.Router | null = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          router = await this.createRouterForConsultation(consultationId);
          break;
        } catch (createError) {
          retryCount++;
          this.logStructured('warn', 'Failed to create router, retrying', {
            consultationId,
            attempt: retryCount,
            maxRetries,
            error: createError.message,
          });

          if (retryCount >= maxRetries) {
            throw createError;
          }

          // Wait before retry (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, retryCount) * 1000),
          );
        }
      }

      // Ensure router was created successfully
      if (!router) {
        throw new Error('Failed to create router after maximum retries');
      }

      this.logStructured('log', 'Router ensured for consultation', {
        consultationId,
        routerId: router!.id,
        retriesNeeded: retryCount,
      });

      return router!;
    } catch (error) {
      this.logStructured('error', 'Failed to ensure router for consultation', {
        consultationId,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(
        `Failed to ensure router for consultation ${consultationId}: ${error.message}`,
      );
    }
  }

  /**
   * Handles consultation state changes and ensures proper media session coordination
   */
  async handleConsultationStateChange(
    consultationId: number,
    newStatus: string,
    participantCount: number = 0,
  ): Promise<void> {
    try {
      const router = this.getRouter(consultationId);

      switch (newStatus) {
        case 'SCHEDULED':
        case 'WAITING':
          // Ensure router is ready when consultation becomes active
          if (!router && participantCount > 0) {
            await this.ensureRouterForConsultation(consultationId);
            this.logStructured(
              'log',
              'Router created for active consultation',
              {
                consultationId,
                status: newStatus,
                participantCount,
              },
            );
          }
          break;

        case 'ACTIVE':
          // Ensure router exists for active consultations
          await this.ensureRouterForConsultation(consultationId);
          this.logStructured('log', 'Router ensured for active consultation', {
            consultationId,
            status: newStatus,
          });
          break;

        case 'COMPLETED':
        case 'TERMINATED_OPEN':
        case 'CANCELLED':
          // Clean up media resources when consultation ends
          if (router) {
            // Give a small delay to allow for final media cleanup
            setTimeout(async () => {
              try {
                await this.cleanupRouterForConsultation(consultationId);
                this.logStructured(
                  'log',
                  'Router cleaned up after consultation ended',
                  {
                    consultationId,
                    status: newStatus,
                  },
                );
              } catch (cleanupError) {
                this.logStructured(
                  'error',
                  'Failed to cleanup router after consultation ended',
                  {
                    consultationId,
                    status: newStatus,
                    error: cleanupError.message,
                  },
                );
              }
            }, 5000);
          }
          break;

        default:
          this.logStructured(
            'verbose',
            'No media action needed for consultation status',
            {
              consultationId,
              status: newStatus,
            },
          );
      }
    } catch (error) {
      this.logStructured(
        'error',
        'Failed to handle consultation state change',
        {
          consultationId,
          newStatus,
          error: error.message,
        },
      );
    }
  }

  /**
   * Health check for consultation's media session
   */
  async checkConsultationMediaHealth(consultationId: number): Promise<{
    hasRouter: boolean;
    routerActive: boolean;
    transportCount: number;
    producerCount: number;
    consumerCount: number;
  }> {
    const router = this.getRouter(consultationId);

    if (!router) {
      return {
        hasRouter: false,
        routerActive: false,
        transportCount: 0,
        producerCount: 0,
        consumerCount: 0,
      };
    }

    // Count related resources
    let transportCount = 0;
    let producerCount = 0;
    let consumerCount = 0;

    for (const [transportId, transport] of this.transports) {
      if (transport.appData?.consultationId === consultationId) {
        transportCount++;
      }
    }

    for (const [producerId, producer] of this.producers) {
      if (producer.appData?.consultationId === consultationId) {
        producerCount++;
      }
    }

    for (const [consumerId, consumer] of this.consumers) {
      if (consumer.appData?.consultationId === consultationId) {
        consumerCount++;
      }
    }

    return {
      hasRouter: true,
      routerActive: !router.closed,
      transportCount,
      producerCount,
      consumerCount,
    };
  }

  private pollTransportStats(
    consultationId: number,
    transport: mediasoup.types.Transport,
  ) {
    const pollInterval = this.configService.transportStatsPollInterval || 5000;

    const interval = setInterval(async () => {
      try {
        const stats = await transport.getStats();
        const key = `${consultationId}-transport-${transport.id}`;
        this.connectionStats.set(key, { stats, lastUpdated: Date.now() });
        this.logger.verbose(`Collected transport stats for ${key}`);
      } catch (error) {
        this.logger.warn(
          `Failed to collect stats for transport ${transport.id}: ${error.message}`,
        );
      }
    }, pollInterval);

    (transport as any)._statsInterval = interval;

    transport.on('@close', () => {
      clearInterval(interval);
      this.connectionStats.delete(
        `${consultationId}-transport-${transport.id}`,
      );
      this.logger.verbose(
        `Transport ${transport.id} closed, stopped stats polling`,
      );
    });
  }

  private pollProducerStats(
    consultationId: number,
    producer: mediasoup.types.Producer,
  ) {
    const pollInterval = this.configService.producerStatsPollInterval || 5000;

    const interval = setInterval(async () => {
      try {
        const stats = await producer.getStats();
        const key = `${consultationId}-producer-${producer.id}`;
        this.connectionStats.set(key, { stats, lastUpdated: Date.now() });
        this.logger.verbose(`Collected producer stats for ${key}`);
      } catch (error) {
        this.logger.warn(
          `Failed to collect stats for producer ${producer.id}: ${error.message}`,
        );
      }
    }, pollInterval);

    (producer as any)._statsInterval = interval;

    producer.on('@close', () => {
      clearInterval(interval);
      this.connectionStats.delete(`${consultationId}-producer-${producer.id}`);
      this.logger.verbose(
        `Producer ${producer.id} closed, stopped stats polling`,
      );
    });
  }

  async createTransport(
    consultationId: number,
    type: 'producer' | 'consumer',
  ): Promise<any> {
    const routerEntry = this.routers.get(consultationId);
    if (!routerEntry) throw new Error('Router not found for consultation');

    const { router, correlationId } = routerEntry;
    const announcedIp = this.configService.mediasoupAnnouncedIp;

    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    this.transports.set(transport.id, transport);
    this.pollTransportStats(consultationId, transport);

    try {
      await this.databaseService.mediasoupTransport.create({
        data: {
          id: transport.id,
          consultationId,
          type,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      this.logStructured('warn', 'Failed to persist transport', {
        transportId: transport.id,
        error: error.message,
        consultationId,
        correlationId,
      });
    }

    transport.on('@close', () =>
      this.logStructured('log', 'Transport closed by mediasoup', {
        transportId: transport.id,
        consultationId,
        correlationId,
      }),
    );

    this.logStructured('log', 'Transport created', {
      transportId: transport.id,
      consultationId,
      correlationId,
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters,
  ) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    await transport.connect({ dtlsParameters });
    this.logStructured('log', 'Transport connected', { transportId });
  }

  async produce(
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: mediasoup.types.RtpParameters,
    appData?: any,
  ) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = await transport.produce({ kind, rtpParameters, appData });
    this.producers.set(producer.id, producer);
    this.pollProducerStats(appData?.consultationId, producer);

    try {
      await this.databaseService.mediasoupProducer.create({
        data: {
          id: producer.id,
          transportId,
          consultationId: appData?.consultationId ?? null,
          kind,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      this.logStructured('warn', 'Failed to persist producer', {
        producerId: producer.id,
        error: error.message,
      });
    }

    producer.on('@close', () =>
      this.logStructured('log', 'Producer closed by mediasoup', {
        producerId: producer.id,
      }),
    );

    this.logStructured('log', 'Producer created', {
      producerId: producer.id,
      transportId,
    });

    return { id: producer.id };
  }

  async consume(
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities,
  ) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });
    this.consumers.set(consumer.id, consumer);

    consumer.on('@close', () =>
      this.logStructured('log', 'Consumer closed by mediasoup', {
        consumerId: consumer.id,
      }),
    );

    this.logStructured('log', 'Consumer created', {
      consumerId: consumer.id,
      transportId,
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
    };
  }

  async closeTransport(transportId: string) {
    const transport = this.transports.get(transportId);
    if (transport) {
      clearInterval((transport as any)._statsInterval);
      this.connectionStats.delete(`transport-${transportId}`);
      await transport.close();
      this.transports.delete(transportId);
      this.logStructured('log', 'Transport closed', { transportId });

      try {
        await this.databaseService.mediasoupTransport.delete({
          where: { id: transportId },
        });
      } catch (error) {
        this.logStructured('warn', 'Failed to remove transport from DB', {
          transportId,
          error: error.message,
        });
      }
    }
  }

  async closeProducer(producerId: string) {
    const producer = this.producers.get(producerId);
    if (producer) {
      clearInterval((producer as any)._statsInterval);
      this.connectionStats.delete(`producer-${producerId}`);
      await producer.close();
      this.producers.delete(producerId);
      this.logStructured('log', 'Producer closed', { producerId });

      try {
        await this.databaseService.mediasoupProducer.delete({
          where: { id: producerId },
        });
      } catch (error) {
        this.logStructured('warn', 'Failed to remove producer from DB', {
          producerId,
          error: error.message,
        });
      }
    }
  }

  async closeConsumer(consumerId: string) {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      await consumer.close();
      this.consumers.delete(consumerId);
      this.logStructured('log', 'Consumer closed', { consumerId });
    }
  }

  async cleanupInactiveSessions() {
    const now = Date.now();

    for (const [consultationId] of this.routers.entries()) {
      const participants = await this.databaseService.participant.findMany({
        where: { consultationId, isActive: true },
        select: { lastActiveAt: true },
      });

      if (participants.length === 0) {
        this.logStructured(
          'log',
          'Cleaning up session with no active participants',
          { consultationId },
        );
        await this.cleanupRouterForConsultation(consultationId);
        await this.databaseService.consultation.update({
          where: { id: consultationId },
          data: { status: 'TERMINATED_OPEN' },
        });
        continue;
      }

      const allInactive = participants.every(
        (p) =>
          p.lastActiveAt &&
          now - new Date(p.lastActiveAt).getTime() > this.sessionTimeoutMs,
      );

      if (allInactive) {
        this.logStructured(
          'log',
          'Cleaning up inactive session due to timeout',
          { consultationId },
        );
        await this.cleanupRouterForConsultation(consultationId);
        await this.databaseService.consultation.update({
          where: { id: consultationId },
          data: { status: 'TERMINATED_OPEN' },
        });
      }
    }
  }

  async monitorAndScaleWorkers() {
    if (this.workers.length === 0) {
      this.logStructured(
        'warn',
        'No mediasoup workers available during scaling check',
      );
      return;
    }

    const totalRouters = Array.from(this.workerRouterCount.values()).reduce(
      (a, b) => a + b,
      0,
    );
    const avgLoad = totalRouters / this.workers.length;

    if (avgLoad > this.scalingThresholdHigh) {
      this.logStructured('log', 'Scaling workers up due to high load', {
        avgLoad,
        currentWorkers: this.workers.length,
      });
      await this.scaleWorkers(this.workers.length + 1);
    } else if (avgLoad < this.scalingThresholdLow && this.workers.length > 1) {
      this.logStructured('log', 'Scaling workers down due to low load', {
        avgLoad,
        currentWorkers: this.workers.length,
      });
      await this.removeIdleWorkers();
    }
  }

  async onModuleDestroy() {
    this.logStructured(
      'log',
      'Cleaning up mediasoup resources on module destroy',
    );

    for (const consumer of this.consumers.values()) {
      try {
        await consumer.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing consumer during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.consumers.clear();

    for (const producer of this.producers.values()) {
      try {
        await producer.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing producer during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.producers.clear();

    for (const transport of this.transports.values()) {
      try {
        await transport.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing transport during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.transports.clear();

    for (const entry of this.routers.values()) {
      try {
        await entry.router.close();
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing router during module destroy',
          {
            error: error.message,
          },
        );
      }
    }
    this.routers.clear();

    for (const worker of this.workers) {
      try {
        await worker.close();
        this.logStructured('log', 'Worker closed during module destroy', {
          pid: worker.pid,
        });
      } catch (error) {
        this.logStructured(
          'error',
          'Error closing worker during module destroy',
          {
            pid: worker.pid,
            error: error.message,
          },
        );
      }
    }
    this.workers = [];
    this.workerRouterCount.clear();

    try {
      await this.redisPublisher?.quit();
      await this.redisSubscriber?.quit();
      this.logStructured('log', 'Redis clients closed successfully.');
    } catch (err) {
      this.logger.error(
        'Error closing Redis clients during module destroy',
        err,
      );
    }
  }

  async getHealthMetrics() {
    const isDevelopment = this.configService.isDevelopment;
    const totalRouters = Array.from(this.workerRouterCount.values()).reduce(
      (a, b) => a + b,
      0,
    );

    // Calculate per-worker load distribution
    const workerLoadDistribution = this.workers.map(worker => ({
      pid: worker.pid,
      routerCount: this.workerRouterCount.get(worker.pid) || 0,
      status: worker.closed ? 'closed' : 'active',
    }));

    // Get consultation routing status
    const consultationRouterMap = Array.from(this.routers.entries()).map(([consultationId, entry]) => ({
      consultationId,
      routerId: entry.router.id,
      workerPid: entry.workerPid,
      correlationId: entry.correlationId,
      closed: entry.router.closed,
    }));

    // Redis cluster status
    const redisStatus = {
      configured: this.isRedisConfigured,
      url: isDevelopment ? this.configService.redisUrl || 'not-configured' : '[REDACTED]',
      publisher: this.redisPublisher ? 'connected' : 'disconnected',
      subscriber: this.redisSubscriber ? 'connected' : 'disconnected',
      serverCount: this.serverLoad.size,
      clusterServers: Array.from(this.serverLoad.entries()).map(([serverId, load]) => ({
        serverId,
        load,
        isCurrent: serverId === this.serverId,
      })),
    };

    return {
      timestamp: new Date().toISOString(),
      environment: isDevelopment ? 'development' : 'production',
      serverId: this.serverId,
      redis: redisStatus,
      workers: {
        count: this.workers.length,
        recommended: isDevelopment ? 2 : 4,
        pids: this.workers.map(w => w.pid),
        distribution: workerLoadDistribution,
      },
      sessions: {
        activeRouters: this.routers.size,
        activeTransports: this.transports.size,
        activeProducers: this.producers.size,
        activeConsumers: this.consumers.size,
        consultationMappings: consultationRouterMap.length,
      },
      load: {
        totalActiveRouters: totalRouters,
        averagePerWorker: this.workers.length > 0 ? totalRouters / this.workers.length : 0,
        scalingThresholds: {
          low: this.scalingThresholdLow,
          high: this.scalingThresholdHigh,
        },
        perWorker: workerLoadDistribution,
        ...(this.isRedisConfigured && {
          clusterLoad: Object.fromEntries(this.serverLoad.entries())
        })
      },
      configuration: {
        sessionTimeoutMs: this.sessionTimeoutMs,
        announcedIp: this.configService.mediasoupAnnouncedIp,
        isDevelopment,
        isProduction: this.configService.isProduction,
      },
      transitions: {
        pendingRouterCreations: this.consultationRouterLocks.size,
        routerTransitions: Array.from(this.consultationRouterLocks.keys()),
      },
      routing: {
        consultationRouters: consultationRouterMap,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }

  async acquireRouterAssignmentLock(consultationId: number): Promise<boolean> {
    // If Redis is not configured, always allow lock acquisition (single-server mode)
    if (!this.isRedisConfigured || this.redisPublisher === null) {
      return true;
    }

    const lockKey = `mediasoup:router_lock:${consultationId}`;
    try {
      const lockAcquired = await this.redisPublisher.set(
        lockKey,
        this.serverId,
        {
          NX: true,
          PX: 30000,
        },
      );
      return lockAcquired === 'OK';
    } catch (error) {
      this.logger.warn(
        `Failed to acquire router assignment lock for consultation ${consultationId}: ${error.message}`,
      );
      // Return true to allow operation in case of Redis failure
      return true;
    }
  }

  async releaseRouterAssignmentLock(consultationId: number): Promise<void> {
    // If Redis is not configured, no need to release lock (single-server mode)
    if (!this.isRedisConfigured || this.redisPublisher === null) {
      return;
    }

    const lockKey = `mediasoup:router_lock:${consultationId}`;
    try {
      await this.redisPublisher.del(lockKey);
    } catch (error) {
      this.logger.warn(
        `Failed to release router assignment lock for consultation ${consultationId}: ${error.message}`,
      );
    }
  }

  getConnectionStats(consultationId: number) {
    const result: Record<string, any> = {};
    for (const [key, value] of this.connectionStats.entries()) {
      if (key.startsWith(`${consultationId}-`)) {
        result[key] = value;
      }
    }
    return result;
  }
}

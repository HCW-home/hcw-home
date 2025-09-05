import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MediasoupSessionService } from './mediasoup-session.service';
import { ConfigService } from 'src/config/config.service';

@ApiTags('MediaSoup Health')
@Controller('mediasoup/health')
export class MediasoupHealthController {
 private readonly logger = new Logger(MediasoupHealthController.name);

 constructor(
  private readonly mediasoupSessionService: MediasoupSessionService,
  private readonly configService: ConfigService,
 ) { }

 @Get()
 @ApiOperation({
  summary: 'Get MediaSoup cluster health metrics',
  description: 'Returns comprehensive health information about MediaSoup workers, routers, and cluster status'
 })
 @ApiResponse({
  status: 200,
  description: 'Health metrics retrieved successfully',
  schema: {
   type: 'object',
   properties: {
    status: { type: 'string', example: 'healthy' },
    timestamp: { type: 'string', format: 'date-time' },
    environment: { type: 'string', example: 'development' },
    serverId: { type: 'string', example: 'dev-server-1' },
    redis: {
     type: 'object',
     properties: {
      configured: { type: 'boolean' },
      url: { type: 'string' }
     }
    },
    workers: {
     type: 'object',
     properties: {
      count: { type: 'number' },
      recommended: { type: 'number' },
      pids: { type: 'array', items: { type: 'number' } }
     }
    },
    sessions: {
     type: 'object',
     properties: {
      activeRouters: { type: 'number' },
      activeTransports: { type: 'number' },
      activeProducers: { type: 'number' },
      activeConsumers: { type: 'number' }
     }
    },
    load: {
     type: 'object',
     properties: {
      totalActiveRouters: { type: 'number' },
      perWorker: { type: 'array' }
     }
    }
   }
  }
 })
 async getHealth() {
  try {
   const metrics = await this.mediasoupSessionService.getHealthMetrics();

   const status = this.determineHealthStatus(metrics);

   return {
    status,
    ...metrics,
   };
  } catch (error) {
   this.logger.error('Failed to get health metrics', error);
   return {
    status: 'unhealthy',
    error: 'Failed to retrieve health metrics',
    timestamp: new Date().toISOString(),
    environment: this.configService.isDevelopment ? 'development' : 'production',
   };
  }
 }

 @Get('detailed')
 @ApiOperation({
  summary: 'Get detailed MediaSoup diagnostics',
  description: 'Returns detailed diagnostic information for troubleshooting'
 })
 @ApiResponse({ status: 200, description: 'Detailed diagnostics retrieved successfully' })
 async getDetailedHealth() {
  try {
   const metrics = await this.mediasoupSessionService.getHealthMetrics();

   const diagnostics = {
    ...metrics,
    system: {
     nodeVersion: process.version,
     platform: process.platform,
     arch: process.arch,
     cpuUsage: process.cpuUsage(),
     resourceUsage: process.resourceUsage(),
    },
    configuration: {
     environment: this.configService.environment,
     isDevelopment: this.configService.isDevelopment,
     isProduction: this.configService.isProduction,
     sessionTimeoutMs: this.configService.sessionTimeoutMs,
     consultationTimeoutMs: this.configService.consultationTimeoutMs,
    },
    recommendations: this.generateRecommendations(metrics),
   };

   return {
    status: this.determineHealthStatus(metrics),
    ...diagnostics,
   };
  } catch (error) {
   this.logger.error('Failed to get detailed health metrics', error);
   return {
    status: 'unhealthy',
    error: 'Failed to retrieve detailed health metrics',
    timestamp: new Date().toISOString(),
   };
  }
 }

 private determineHealthStatus(metrics: any): 'healthy' | 'degraded' | 'unhealthy' {
  const { workers, load, environment } = metrics;

  // Check if we have minimum required workers
  if (workers.count === 0) {
   return 'unhealthy';
  }

  if (workers.count < workers.recommended) {
   return 'degraded';
  }

  // Check if load is too high (average > 10 routers per worker)
  const avgLoadPerWorker = workers.count > 0 ? load.totalActiveRouters / workers.count : 0;
  if (avgLoadPerWorker > 10) {
   return 'degraded';
  }

  if (environment === 'production' && !metrics.redis.configured) {
   return 'degraded';
  }

  return 'healthy';
 }

 private generateRecommendations(metrics: any): string[] {
  const recommendations: string[] = [];
  const { workers, load, environment, redis, transitions } = metrics;

  if (workers.count < workers.recommended) {
   recommendations.push(`Consider increasing worker count to ${workers.recommended} for optimal performance`);
  }

  const avgLoadPerWorker = workers.count > 0 ? load.totalActiveRouters / workers.count : 0;
  if (avgLoadPerWorker > 8) {
   recommendations.push('High load detected. Consider adding more workers or scaling horizontally');
  }

  if (environment === 'production' && !redis.configured) {
   recommendations.push('Configure Redis for production multi-server deployment and load balancing');
  }

  if (environment === 'development' && redis.configured && redis.publisher === 'connected') {
   recommendations.push('Redis is configured in development - perfect for testing multi-server scenarios');
  }

  if (workers.count > 6) {
   recommendations.push('Consider horizontal scaling with multiple server instances for better resource distribution');
  }

  // Router transition recommendations
  if (transitions.pendingRouterCreations > 0) {
   recommendations.push(`${transitions.pendingRouterCreations} router creation(s) in progress - monitor for potential deadlocks`);
  }

  if (load.averagePerWorker > 5) {
   recommendations.push('High router density per worker - consider scaling workers or implementing router migration');
  }

  // Redis cluster recommendations
  if (redis.configured && redis.serverCount === 0) {
   recommendations.push('Redis is configured but no cluster servers detected - check Redis connectivity');
  }

  if (redis.configured && redis.serverCount > 1) {
   recommendations.push(`Load balancing across ${redis.serverCount} servers - cluster is functioning properly`);
  }

  // Environment-specific recommendations
  if (environment === 'development') {
   recommendations.push('Development mode: Single-server operation optimized for fast iteration');
   if (!redis.configured) {
    recommendations.push('Redis not configured - this is optimal for local development');
   }
  }

  if (environment === 'production') {
   if (workers.count < 4) {
    recommendations.push('Production environment should have at least 4 workers for redundancy');
   }
   if (!redis.configured) {
    recommendations.push('CRITICAL: Redis clustering required for production multi-server deployment');
   }
  }

  if (recommendations.length === 0) {
   recommendations.push('System is operating optimally. No recommendations at this time.');
  }

  return recommendations;
 }
}

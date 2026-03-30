import { Controller, Get, Version } from '@nestjs/common';
import { HealthService } from '../health/health.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health-v1')
@Controller({ path: 'health', version: '1' })
export class HealthV1Controller {
  constructor(private readonly healthService: HealthService) { }

  // This endpoint will be available at /api/v1/health
  @Get()
  @ApiOperation({ summary: 'Health check endpoint (v1)' })
  @ApiResponse({ status: 200, description: 'Application health status (v1)' })
  async check() {
    return this.healthService.checkHealth();
  }
}

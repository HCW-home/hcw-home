import { Controller, Get, HttpCode, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  checkHealth(): { status: string } {
    return { status: 'ok' };
  }
}

/**
 * Controller for health checks.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  check(): { status: string } {
    return this.healthService.checkHealth();
  }
}

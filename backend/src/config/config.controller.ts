import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { ConfigService } from './config.service';

@ApiTags('config')
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get frontend configuration' })
  @ApiOkResponse({
    description: 'Frontend configuration',
    schema: {
      type: 'object',
      properties: {
        loginMethod: { type: 'string' },
        branding: { type: 'string' },
        logo: { type: 'string' },
      },
    },
  })
  getFrontendConfig(): { loginMethod: string; branding: string; logo: string } {
    return this.configService.frontendConfig;
  }
}

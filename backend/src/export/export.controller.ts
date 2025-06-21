import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  Logger,
  Header,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { ExportService } from './export.service';
import { ExportConsultationsDto } from './dto/export-consultations.dto';

@ApiTags('Export')
@ApiBearerAuth()
@Controller('export')
@UseGuards(AuthGuard, RolesGuard)
export class ExportController {
  private readonly logger = new Logger(ExportController.name);

  constructor(private readonly exportService: ExportService) {}

  @Get('consultations/csv')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Export consultations to a CSV file (Admin only)',
    description:
      'Exports consultation data based on provided filters. Only accessible by users with the ADMIN role.',
  })
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv')
  async exportConsultations(
    @Query() filters: ExportConsultationsDto,
    @Res() res: Response,
  ) {
    this.logger.log(
      `Received request to export consultations with filters: ${JSON.stringify(
        filters,
      )}`,
    );

    const csvData = await this.exportService.exportConsultationsAsCsv(filters);

    const fileName = `consultation-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    res.send(csvData);
  }
} 
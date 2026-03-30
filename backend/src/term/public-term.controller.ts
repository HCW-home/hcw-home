import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TermService } from '../term/term.service';
import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';

@ApiTags('public-terms')
@Controller('public/terms')
export class PublicTermController {
  constructor(private readonly termsService: TermService) { }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest terms (public endpoint)' })
  @ApiQuery({ name: 'language', required: false, example: 'en' })
  @ApiQuery({ name: 'country', required: false, example: 'US' })
  @ApiResponse({ status: 200, description: 'Latest terms retrieved successfully' })
  async getLatestPublic(
    @Query('language') language: string = 'en',
    @Query('country') country: string = 'US'
  ) {
  
    try {
      const data = await this.termsService.getPublicLatest(language, country);
      return ApiResponseDto.success(data, 'Latest terms retrieved');
    } catch (error) {
      return ApiResponseDto.success(null, 'No terms available');
    }
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SmsProviderService } from './sms_provider.service';
import { CreateSmsProviderDto } from './dto/create-sms_provider.dto';
import { UpdateSmsProviderDto } from './dto/update-sms_provider.dto';
import { QuerySmsProviderDto } from './dto/query-sms_provider.dto';
import { SmsProviderResponseDto } from './dto/sms_provider-response.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  ApiResponseDto,
  PaginatedApiResponseDto,
} from 'src/common/helpers/response/api-response.dto';
import {
  createSmsProviderSchema,
  updateSmsProviderSchema,
  querySmsProviderSchema,
} from './validation/sms_provider.validation';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/auth/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { ReorderProvidersDto } from './dto/bulk-reorder.dto';

@ApiTags('sms-providers')
@Controller('sms-provider')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SmsProviderController {
  constructor(private readonly smsProviderService: SmsProviderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new SMS provider' })
  @ApiResponse({
    status: 201,
    description: 'SMS provider created successfully',
    type: SmsProviderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  async create(
    @Body(new ZodValidationPipe(createSmsProviderSchema))
    createSmsProviderDto: CreateSmsProviderDto,
    @Req() req: Request,
  ) {
    const smsProvider =
      await this.smsProviderService.create(createSmsProviderDto);
    return ApiResponseDto.created(
      smsProvider,
      'SMS provider created successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all SMS providers with pagination and filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'SMS providers retrieved successfully',
    type: [SmsProviderResponseDto],
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for provider name or prefix',
  })
  @ApiQuery({
    name: 'isWhatsapp',
    required: false,
    type: Boolean,
    description: 'Filter by WhatsApp support',
  })
  @ApiQuery({
    name: 'isDisabled',
    required: false,
    type: Boolean,
    description: 'Filter by disabled status',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['id', 'order', 'provider', 'prefix', 'createdAt', 'updatedAt'],
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
  async findAll(
    @Query(new ZodValidationPipe(querySmsProviderSchema))
    query: QuerySmsProviderDto,
    @Req() req: Request,
  ) {
    const result = await this.smsProviderService.findAll(query);

    return PaginatedApiResponseDto.paginatedSuccess(
      result.smsProviders,
      result.total,
      result.page,
      result.limit,
      'SMS providers retrieved successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get SMS provider by ID' })
  @ApiParam({ name: 'id', description: 'SMS Provider ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'SMS provider retrieved successfully',
    type: SmsProviderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'SMS provider not found' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const smsProvider = await this.smsProviderService.findOne(id);
    return ApiResponseDto.success(
      smsProvider,
      'SMS provider retrieved successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update SMS provider by ID' })
  @ApiParam({ name: 'id', description: 'SMS Provider ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'SMS provider updated successfully',
    type: SmsProviderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'SMS provider not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateSmsProviderSchema))
    updateSmsProviderDto: UpdateSmsProviderDto,
    @Req() req: Request,
  ) {
    const smsProvider = await this.smsProviderService.update(
      id,
      updateSmsProviderDto,
    );
    return ApiResponseDto.success(
      smsProvider,
      'SMS provider updated successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete SMS provider by ID' })
  @ApiParam({ name: 'id', description: 'SMS Provider ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'SMS provider deleted successfully',
    type: SmsProviderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'SMS provider not found' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const smsProvider = await this.smsProviderService.remove(id);
    return ApiResponseDto.success(
      smsProvider,
      'SMS provider deleted and order rebalanced successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Post('fix-order-sequence')
  @ApiOperation({
    summary: 'Fix order sequence (utility endpoint for data corruption)',
    description:
      'Reorders all SMS providers to have sequential order numbers starting from 1',
  })
  @ApiResponse({
    status: 200,
    description: 'Order sequence fixed successfully',
  })
  async fixOrderSequence(@Req() req: Request) {
    const result = await this.smsProviderService.fixOrderSequence();
    return ApiResponseDto.success(
      result,
      'Order sequence fixed successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Post('reorder')
  @ApiOperation({
    summary: 'Bulk reorder SMS providers',
    description:
      'Update the order of multiple SMS providers in a single operation',
  })
  @ApiBody({
    description: 'Array of provider IDs with their new order positions',
    schema: {
      type: 'object',
      properties: {
        providerOrders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', description: 'Provider ID' },
              order: { type: 'number', description: 'New order position' },
            },
            required: ['id', 'order'],
          },
        },
      },
      required: ['providerOrders'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Providers reordered successfully',
    type: [SmsProviderResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - duplicate order numbers',
  })
  async reorderProviders(
    @Body() reorderDto: ReorderProvidersDto,
    @Req() req: Request,
  ) {
    const reorderedProviders = await this.smsProviderService.reorderProviders(
      reorderDto.providerOrders,
    );
    return ApiResponseDto.success(
      reorderedProviders,
      'Providers reordered successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }
}

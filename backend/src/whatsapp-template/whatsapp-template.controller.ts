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
} from '@nestjs/swagger';
import { Request } from 'express';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { QueryWhatsappTemplateDto } from './dto/query-whatsapp-template.dto';
import { WhatsappTemplateResponseDto } from './dto/whatsapp-template-response.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  ApiResponseDto,
  PaginatedApiResponseDto,
} from 'src/common/helpers/response/api-response.dto';
import {
  createWhatsappTemplateSchema,
  updateWhatsappTemplateSchema,
  queryWhatsappTemplateSchema,
} from './validation/whatsapp-template.validation';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/auth/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';


@ApiTags('whatsapp-templates')
@Controller('whatsapp-template')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WhatsappTemplateController {
  constructor(
    private readonly whatsappTemplateService: WhatsappTemplateService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new WhatsApp template' })
  @ApiResponse({
    status: 201,
    description: 'WhatsApp template created successfully',
    type: WhatsappTemplateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - template key already exists',
  })
  async create(
    @Body(new ZodValidationPipe(createWhatsappTemplateSchema))
    createWhatsappTemplateDto: CreateWhatsappTemplateDto,
    @Req() req: Request,
  ) {
    const template = await this.whatsappTemplateService.create(
      createWhatsappTemplateDto,
    );
    return ApiResponseDto.created(
      template,
      'WhatsApp template created successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all WhatsApp templates with pagination and filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'WhatsApp templates retrieved successfully',
    type: [WhatsappTemplateResponseDto],
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
    description: 'Search by template name or key',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['AUTHENTICATION', 'MARKETING', 'UTILITY'],
    description: 'Filter by category',
  })
  @ApiQuery({
    name: 'approvalStatus',
    required: false,
    enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'],
    description: 'Filter by approval status',
  })
  @ApiQuery({
    name: 'language',
    required: false,
    type: String,
    description: 'Filter by language',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['id', 'friendlyName', 'createdAt', 'updatedAt'],
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
  async findAll(
    @Query(new ZodValidationPipe(queryWhatsappTemplateSchema))
    query: QueryWhatsappTemplateDto,
    @Req() req: Request,
  ) {
    const result = await this.whatsappTemplateService.findAll(query);

    return PaginatedApiResponseDto.paginatedSuccess(
      result.templates,
      result.total,
      result.page,
      result.limit,
      'WhatsApp templates retrieved successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }


  @Get('sid/:sid')
  @ApiOperation({ summary: 'Get WhatsApp template by SID' })
  @ApiParam({ name: 'sid', description: 'Template SID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Template retrieved successfully',
    type: WhatsappTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findBySid(@Param('sid') sid: string, @Req() req: Request) {
    const template = await this.whatsappTemplateService.findBySid(sid);
    if (!template) {
      return ApiResponseDto.notFound('Template not found', {
        requestId: req['id'],
        path: req.path,
      });
    }
    return ApiResponseDto.success(
      template,
      'Template retrieved successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get WhatsApp template by ID' })
  @ApiParam({ name: 'id', description: 'Template ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Template retrieved successfully',
    type: WhatsappTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const template = await this.whatsappTemplateService.findOne(id);
    return ApiResponseDto.success(
      template,
      'Template retrieved successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update WhatsApp template by ID' })
  @ApiParam({ name: 'id', description: 'Template ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Template updated successfully',
    type: WhatsappTemplateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - template key already exists',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateWhatsappTemplateSchema))
    updateWhatsappTemplateDto: UpdateWhatsappTemplateDto,
    @Req() req: Request,
  ) {
    const template = await this.whatsappTemplateService.update(
      id,
      updateWhatsappTemplateDto,
    );
    return ApiResponseDto.success(
      template,
      'Template updated successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }


  @Delete(':id')
  @ApiOperation({ summary: 'Delete WhatsApp template by ID' })
  @ApiParam({ name: 'id', description: 'Template ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Template deleted successfully',
    type: WhatsappTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const template = await this.whatsappTemplateService.remove(id);
    return ApiResponseDto.success(
      template,
      'Template deleted successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }
}
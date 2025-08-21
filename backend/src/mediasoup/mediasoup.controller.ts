import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
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
import { MediasoupServerService } from './mediasoup.service';
import { CreateMediasoupServerDto } from './dto/create-mediasoup-server.dto';
import { UpdateMediasoupServerDto } from './dto/update-mediasoup-server.dto';
import { QueryMediasoupServerDto } from './dto/query-mediasoup-server.dto';
import { MediasoupServerResponseDto } from './dto/mediasoup-server-response.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  ApiResponseDto,
  PaginatedApiResponseDto,
} from '../common/helpers/response/api-response.dto';
import {
  createMediasoupServerSchema,
  updateMediasoupServerSchema,
  queryMediasoupServerSchema,
} from './validation/mediasoup.validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Mediasoup Servers')
@Controller('mediasoup-server')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MediasoupServerController {
  constructor(
    private readonly mediasoupServerService: MediasoupServerService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new Mediasoup server' })
  @ApiResponse({
    status: 201,
    description: 'Mediasoup server created successfully',
    type: MediasoupServerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 409,
    description: 'Server with given URL already exists',
  })
  async create(
    @Body(new ZodValidationPipe(createMediasoupServerSchema))
    createDto: CreateMediasoupServerDto,
    @Req() req: Request,
  ) {
    const result = await this.mediasoupServerService.create(createDto);

    return ApiResponseDto.created(
      result,
      'Mediasoup server created successfully',
      {
        path: req.path,
        requestId: req['id'],
      },
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List all Mediasoup servers with filters/pagination',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({
    name: 'sortBy',
    enum: [
      'url',
      'username',
      'maxNumberOfSessions',
      'active',
      'createdAt',
      'updatedAt',
    ],
    required: false,
  })
  @ApiQuery({ name: 'sortOrder', enum: ['asc', 'desc'], required: false })
  @ApiResponse({
    status: 200,
    description: 'Mediasoup servers retrieved successfully',
    type: [MediasoupServerResponseDto],
  })
  async findAll(
    @Query(new ZodValidationPipe(queryMediasoupServerSchema))
    query: QueryMediasoupServerDto,
    @Req() req: Request,
  ) {
    const result = await this.mediasoupServerService.findAll(query);

    return PaginatedApiResponseDto.paginatedSuccess(
      result.items,
      result.total,
      result.page,
      result.limit,
      'Mediasoup servers retrieved successfully',
      {
        path: req.path,
        requestId: req['id'],
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific Mediasoup server by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Mediasoup server ID' })
  @ApiResponse({
    status: 200,
    type: MediasoupServerResponseDto,
    description: 'Mediasoup server fetched successfully',
  })
  @ApiResponse({ status: 404, description: 'Mediasoup server not found' })
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const result = await this.mediasoupServerService.findOne(id);

    return ApiResponseDto.success(
      result,
      'Mediasoup server retrieved successfully',
      200,
      {
        path: req.path,
        requestId: req['id'],
      },
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Mediasoup server by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Server ID to update' })
  @ApiResponse({
    status: 200,
    description: 'Mediasoup server updated successfully',
    type: MediasoupServerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 409, description: 'Duplicate server URL' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMediasoupServerSchema))
    updateDto: UpdateMediasoupServerDto,
    @Req() req: Request,
  ) {
    const result = await this.mediasoupServerService.update(id, updateDto);

    return ApiResponseDto.success(
      result,
      'Mediasoup server updated successfully',
      200,
      {
        path: req.path,
        requestId: req['id'],
      },
    );
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Toggle a Mediasoup server’s active state' })
  @ApiParam({ name: 'id', type: String, description: 'Server ID' })
  @ApiResponse({ status: 200, type: MediasoupServerResponseDto })
  async toggleActive(@Param('id') id: string, @Req() req: Request) {
    const result = await this.mediasoupServerService.toggleActive(id);

    return ApiResponseDto.success(
      result,
      `Mediasoup server ${result.active ? 'activated' : 'deactivated'} successfully`,
      200,
      {
        path: req.path,
        requestId: req['id'],
      },
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a Mediasoup server (permanently)' })
  @ApiParam({ name: 'id', type: String, description: 'Server ID to delete' })
  @ApiResponse({
    status: 200,
    description: 'Mediasoup server deleted successfully',
    type: MediasoupServerResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Mediasoup server not found' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const result = await this.mediasoupServerService.remove(id);

    return ApiResponseDto.success(
      result,
      'Mediasoup server deleted successfully',
      200,
      {
        path: req.path,
        requestId: req['id'],
      },
    );
  }
}

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
  HttpStatus,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QueryOrganizationDto } from './dto/query-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  ApiResponseDto,
  PaginatedApiResponseDto,
} from 'src/common/helpers/response/api-response.dto';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  queryOrganizationSchema,
  queryMembersSchema,
  updateMemberRoleSchema,
  addMemberSchema,
} from './validation/organization.validation';
import { QueryMembersDto } from './dto/query-members.dto';
import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';





@ApiTags('organizations')
@Controller('organization')
@UseGuards(AuthGuard,RolesGuard)
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({
    status: 201,
    description: 'Organization created successfully',
    type: OrganizationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - organization name already exists',
  })
  async create(
    @Body(new ZodValidationPipe(createOrganizationSchema))
    createOrganizationDto: CreateOrganizationDto,
    @Req() req: Request,
  ) {
    const organization = await this.organizationService.create(
      createOrganizationDto,
    );
    return ApiResponseDto.created(
      organization,
      'Organization created successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all organizations with pagination and filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Organizations retrieved successfully',
    type: [OrganizationResponseDto],
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
    description: 'Search term',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['id', 'name', 'createdAt', 'updatedAt'],
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
  async findAll(
    @Query(new ZodValidationPipe(queryOrganizationSchema))
    query: QueryOrganizationDto,
    @Req() req: Request,
  ) {
    const result = await this.organizationService.findAll(query);

    return PaginatedApiResponseDto.paginatedSuccess(
      result.organizations,
      result.total,
      result.page,
      result.limit,
      'Organizations retrieved successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Organization retrieved successfully',
    type: OrganizationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const organization = await this.organizationService.findOne(id);
    return ApiResponseDto.success(
      organization,
      'Organization retrieved successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organization by ID' })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Organization updated successfully',
    type: OrganizationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict - organization name already exists',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateOrganizationSchema))
    updateOrganizationDto: UpdateOrganizationDto,
    @Req() req: Request,
  ) {
    const organization = await this.organizationService.update(
      id,
      updateOrganizationDto,
    );
    return ApiResponseDto.success(
      organization,
      'Organization updated successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete organization by ID' })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Organization deleted successfully',
    type: OrganizationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const organization = await this.organizationService.remove(id);
    return ApiResponseDto.success(
      organization,
      'Organization deleted successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add member to organization' })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiResponse({
    status: 201,
    description: 'Member added successfully',
    type: OrganizationMemberResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Organization or User not found' })
  @ApiResponse({
    status: 409,
    description: 'User already member of organization',
  })
  async addMember(
    @Param('id', ParseIntPipe) organizationId: number,
    @Body(new ZodValidationPipe(addMemberSchema))
    addMemberDto: AddMemberDto,
    @Req() req: Request,
  ) {
    const member = await this.organizationService.addMember(
      organizationId,
      addMemberDto,
    );
    return ApiResponseDto.created(member, 'Member added successfully', {
      requestId: req['id'],
      path: req.path,
    });
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'Get organization members with pagination and filtering',
  })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Members retrieved successfully',
    type: [OrganizationMemberResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
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
    description: 'Search by user name or email',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['ADMIN', 'MEMBER'],
    description: 'Filter by role',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['id', 'joinedAt', 'role'],
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
  async getMembers(
    @Param('id', ParseIntPipe) organizationId: number,
    @Query(new ZodValidationPipe(queryMembersSchema))
    query: QueryMembersDto,
    @Req() req: Request,
  ) {
    const result = await this.organizationService.getMembers(
      organizationId,
      query,
    );

    return PaginatedApiResponseDto.paginatedSuccess(
      result.members,
      result.total,
      result.page,
      result.limit,
      'Members retrieved successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Get(':id/members/:memberId')
  @ApiOperation({ summary: 'Get specific organization member' })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiParam({ name: 'memberId', description: 'Member ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Member retrieved successfully',
    type: OrganizationMemberResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Organization or Member not found' })
  async getMember(
    @Param('id', ParseIntPipe) organizationId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Req() req: Request,
  ) {
    const member = await this.organizationService.getMember(
      organizationId,
      memberId,
    );
    return ApiResponseDto.success(
      member,
      'Member retrieved successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Patch(':id/members/:memberId/role')
  @ApiOperation({ summary: 'Update member role in organization' })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiParam({ name: 'memberId', description: 'Member ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Member role updated successfully',
    type: OrganizationMemberResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Organization or Member not found' })
  async updateMemberRole(
    @Param('id', ParseIntPipe) organizationId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body(new ZodValidationPipe(updateMemberRoleSchema))
    updateMemberRoleDto: UpdateMemberRoleDto,
    @Req() req: Request,
  ) {
    const member = await this.organizationService.updateMemberRole(
      organizationId,
      memberId,
      updateMemberRoleDto,
    );
    return ApiResponseDto.success(
      member,
      'Member role updated successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove member from organization' })
  @ApiParam({ name: 'id', description: 'Organization ID', type: 'number' })
  @ApiParam({ name: 'memberId', description: 'Member ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Member removed successfully',
    type: OrganizationMemberResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Organization or Member not found' })
  async removeMember(
    @Param('id', ParseIntPipe) organizationId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Req() req: Request,
  ) {
    const member = await this.organizationService.removeMember(
      organizationId,
      memberId,
    );
    return ApiResponseDto.success(member, 'Member removed successfully', 200, {
      requestId: req['id'],
      path: req.path,
    });
  }
  @Post('upload-logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/logos',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    const fileUrl = `http://localhost:3000/uploads/logos/${file.filename}`;
    return { url: fileUrl };
  }
}

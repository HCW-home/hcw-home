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
  UseGuards,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  ApiResponseDto,
  PaginatedApiResponseDto,
} from 'src/common/helpers/response/api-response.dto';
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  queryUserSchema,
} from './validation/user.validation';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';

@Controller('user')
@UseGuards(AuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 409, description: 'Conflict - email already exists' })
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) createUserDto: CreateUserDto,
    @Req() req: Request,
  ) {
    const user = await this.userService.create(createUserDto);
    return ApiResponseDto.created(user, 'User created successfully', {
      requestId: req['id'],
      path: req.path,
    });
  }
  @Roles(Role.ADMIN, Role.PRACTITIONER)
  @Get()
  @ApiOperation({ summary: 'Get all users with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async findAll(
    @Query(new ZodValidationPipe(queryUserSchema)) query: QueryUserDto,
    @Req() req: Request,
  ) {
    const result = await this.userService.findAll(query);

    return PaginatedApiResponseDto.paginatedSuccess(
      result.users,
      result.total,
      result.page,
      result.limit,
      'Users retrieved successfully',
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }
  // @Roles(Role.ADMIN, Role.PRACTITIONER)
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = await this.userService.findOne(id);
    return ApiResponseDto.success(user, 'User retrieved successfully', 200, {
      requestId: req['id'],
      path: req.path,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Conflict - email already exists' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateUserSchema)) updateUserDto: UpdateUserDto,
    @Req() req: Request,
  ) {
    const user = await this.userService.update(id, updateUserDto);
    return ApiResponseDto.success(user, 'User updated successfully', HttpStatus.OK) }

  @Patch(':id/change-password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - current password incorrect',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(changePasswordSchema))
    changePasswordDto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const user = await this.userService.changePassword(id, changePasswordDto);
    return ApiResponseDto.success(user, 'Password changed successfully', 200, {
      requestId: req['id'],
      path: req.path,
    });
  }
  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'number' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = await this.userService.remove(id);
    return ApiResponseDto.success(user, 'User deleted successfully', 200, {
      requestId: req['id'],
      path: req.path,
    });
  }

  @Roles(Role.ADMIN, Role.PRACTITIONER)
  @Get('role/practitioners')
  @ApiOperation({ summary: 'Get all practitioners' })
  @ApiResponse({
    status: 200,
    description: 'Practitioners retrieved successfully',
  })
  async getPractitioners(@Req() req: Request) {
    const practitioners = await this.userService.findPractitioners();
    return ApiResponseDto.success(
      practitioners,
      'Practitioners retrieved successfully',
      200,
      {
        requestId: req['id'],
        path: req.path,
      },
    );
  }
}



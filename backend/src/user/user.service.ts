// src/modules/user/services/user.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from './../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Check if email already exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(
      createUserDto.password,
      saltRounds,
    );

    // Create user
    const userData = {
      ...createUserDto,
      password: hashedPassword,
    };

    const user = await this.databaseService.user.create({
      data: userData,
    });

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }

  async findAll(query: QueryUserDto) {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      status,
      sex,
      sortBy,
      sortOrder,
    } = query;
    const skip = (page - 1) * limit;

    console.log('page type:', typeof page);
    console.log('limit type:', typeof limit);

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) where.role = role;
    if (status) where.status = status;
    if (sex) where.sex = sex;

    // Build orderBy clause
    const orderBy: Prisma.UserOrderByWithRelationInput = {};
    orderBy[sortBy!] = sortOrder;

    // Execute queries in parallel
    const [users, total] = await Promise.all([
      this.databaseService.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.databaseService.user.count({ where }),
    ]);

    // Transform users to response DTOs
    const transformedUsers = users.map((user) =>
      plainToInstance(UserResponseDto, user, {
        excludeExtraneousValues: false,
      }),
    );

    return {
      users: transformedUsers,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }

  async findByEmail(email: string): Promise<any | null> {
    const user = await this.databaseService.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // Check if user exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Check email uniqueness if email is being updated
    if (updateUserDto.email) {
      const emailExists = await this.databaseService.user.findFirst({
        where: {
          email: updateUserDto.email,
          id: { not: id },
        },
        select: { id: true },
      });

      if (emailExists) {
        throw new ConflictException('Email already exists');
      }
    }

    const user = await this.databaseService.user.update({
      where: { id },
      data: updateUserDto,
    });

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }

  async changePassword(
    id: number,
    changePasswordDto: ChangePasswordDto,
  ): Promise<UserResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      saltRounds,
    );

    const updatedUser = await this.databaseService.user.update({
      where: { id },
      data: { password: hashedNewPassword },
    });

    return plainToInstance(UserResponseDto, updatedUser, {
      excludeExtraneousValues: false,
    });
  }

  async remove(id: number): Promise<UserResponseDto> {
    // Check if user exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const user = await this.databaseService.user.delete({
      where: { id },
    });

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }

  // Additional utility methods
  async exists(id: number): Promise<boolean> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!user;
  }

  async emailExists(email: string, excludeId?: number): Promise<boolean> {
    const where: Prisma.UserWhereInput = { email };
    if (excludeId) {
      where.id = { not: excludeId };
    }

    const user = await this.databaseService.user.findFirst({
      where,
      select: { id: true },
    });
    return !!user;
  }

  async getUserStats() {
    const [total, approved, notApproved, patients, practitioners, admins] =
      await Promise.all([
        this.databaseService.user.count(),
        this.databaseService.user.count({ where: { status: 'APPROVED' } }),
        this.databaseService.user.count({ where: { status: 'NOT_APPROVED' } }),
        this.databaseService.user.count({ where: { role: 'PATIENT' } }),
        this.databaseService.user.count({ where: { role: 'PRACTITIONER' } }),
        this.databaseService.user.count({ where: { role: 'ADMIN' } }),
      ]);

    return {
      total,
      byStatus: {
        approved,
        notApproved,
      },
      byRole: {
        patients,
        practitioners,
        admins,
      },
    };
  }

  async bulkUpdateStatus(
    userIds: number[],
    status: 'APPROVED' | 'NOT_APPROVED',
  ): Promise<{ count: number }> {
    const result = await this.databaseService.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        status,
      },
    });

    return { count: result.count };
  }

  async softDelete(id: number): Promise<UserResponseDto> {
    // If you want to implement soft delete, you would need to add a deletedAt field to your schema
    // For now, this will just update the status to indicate deletion
    const user = await this.databaseService.user.update({
      where: { id },
      data: {
        status: 'NOT_APPROVED', // or create a DELETED status
        updatedAt: new Date(),
      },
    });

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }
}

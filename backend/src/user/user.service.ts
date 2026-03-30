// src/modules/user/services/user.service.ts
import {
  Injectable,
  Logger,
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
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly databaseService: DatabaseService) { }

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const {
      email,
      password,
      organisationIds = [],
      groupIds = [],
      languageIds = [],
      specialityIds = [],
      ...rest
    } = createUserDto;

    // Check if email already exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw HttpExceptionHelper.conflict('Email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(
      password,
      saltRounds,
    );

    // Create user
    let user;
    await this.databaseService.$transaction(async (tx) => {
      user = await tx.user.create({
        data: {
          ...rest,
          email,
          password: hashedPassword,
        },
      });

      const userId = user.id;

      if (organisationIds.length > 0) {
        await tx.organizationMember.createMany({
          data: organisationIds.map((orgId) => ({
            userId,
            organizationId: orgId,
          })),
          skipDuplicates: true,
        });
      }

      if (groupIds.length > 0) {
        await tx.groupMember.createMany({
          data: groupIds.map((groupId) => ({
            userId,
            groupId,
          })),
          skipDuplicates: true,
        });
      }

      if (languageIds.length > 0) {
        await tx.userLanguage.createMany({
          data: languageIds.map((languageId) => ({
            userId,
            languageId,
          })),
          skipDuplicates: true,
        });
      }

      if (specialityIds.length > 0) {
        await tx.userSpeciality.createMany({
          data: specialityIds.map((specialityId) => ({
            userId,
            specialityId,
          })),
          skipDuplicates: true,
        });
      }

      user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          OrganizationMember: { include: { organization: true } },
          GroupMember: { include: { group: true } },
          languages: { include: { language: true } },
          specialities: { include: { speciality: true } },
        },
      });
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
      include: {
        OrganizationMember: { include: { organization: true } },
        GroupMember: { include: { group: true } },
        languages: { include: { language: true } },
        specialities: { include: { speciality: true } },
        UserNotificationSetting: true
      },
    });

    if (!user) {
      throw HttpExceptionHelper.notFound('User not found');
    }

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
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
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const {
      email,
      organisationIds,
      groupIds,
      languageIds,
      specialityIds,
      ...rest
    } = updateUserDto;

    // Check if user exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingUser) {
      throw HttpExceptionHelper.notFound('User not found');
    }

    // Check email uniqueness if email is being updated
    if (email) {
      const emailExists = await this.databaseService.user.findFirst({
        where: {
          email,
          id: { not: id },
        },
        select: { id: true },
      });

      if (emailExists) {
        throw HttpExceptionHelper.conflict('Email already exists');
      }
    }
    let user;
    await this.databaseService.$transaction(async (tx) => {
      user = await tx.user.update({
        where: { id },
        data: { ...rest, email },
      });

      if (organisationIds) {
        await tx.organizationMember.deleteMany({ where: { userId: id } });
        if (organisationIds.length > 0) {
          await tx.organizationMember.createMany({
            data: organisationIds.map((orgId) => ({
              userId: id,
              organizationId: orgId,
            })),
          });
        }
      }

      if (groupIds) {
        await tx.groupMember.deleteMany({ where: { userId: id } });
        if (groupIds.length > 0) {
          await tx.groupMember.createMany({
            data: groupIds.map((groupId) => ({
              userId: id,
              groupId,
            })),
          });
        }
      }

      if (languageIds) {
        await tx.userLanguage.deleteMany({ where: { userId: id } });
        if (languageIds.length > 0) {
          await tx.userLanguage.createMany({
            data: languageIds.map((languageId) => ({
              userId: id,
              languageId,
            })),
          });
        }
      }

      if (specialityIds) {
        await tx.userSpeciality.deleteMany({ where: { userId: id } });
        if (specialityIds.length > 0) {
          await tx.userSpeciality.createMany({
            data: specialityIds.map((specialityId) => ({
              userId: id,
              specialityId,
            })),
          });
        }
      }
    });
    // after update return the full user 
    return await this.findOne(id)
  }

  async changePassword(
    id: number,
    changePasswordDto: ChangePasswordDto,
  ): Promise<UserResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw HttpExceptionHelper.notFound('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw HttpExceptionHelper.badRequest('Current password is incorrect');
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
      throw HttpExceptionHelper.notFound('User not found');
    }

    const user = await this.databaseService.user.delete({
      where: { id },
    });

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: false,
    });
  }

  /**
   * Anonymize a user by removing PII fields. Keeps non-sensitive data for analytics.
   */
  async anonymizeUser(id: number): Promise<UserResponseDto> {
    const anonymizedData = {
      firstName: 'Anonymized',
      lastName: 'User',
      email: `anonymized_${id}@example.com`,
      phoneNumber: null,
      country: null,
      sex: null,
      updatedAt: new Date(),
    };
    const user = await this.databaseService.user.update({
      where: { id },
      data: anonymizedData,
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

  async findPractitioners(): Promise<UserResponseDto[]> {
    const practitioners = await this.databaseService.user.findMany({
      where: {
        role: 'PRACTITIONER',
        status: 'APPROVED',
      },
      include: {
        languages: { include: { language: true } },
        specialities: { include: { speciality: true } },
      },
    });

    return practitioners.map((user) =>
      plainToInstance(UserResponseDto, user, {
        excludeExtraneousValues: false,
      }),
    );
  }
}

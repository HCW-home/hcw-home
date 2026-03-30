import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QueryOrganizationDto } from './dto/query-organization.dto';
import { QueryMembersDto } from './dto/query-members.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(private readonly databaseService: DatabaseService) { }

  async create(
    createOrganizationDto: CreateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    // Check if organization name already exists
    const existingOrganization =
      await this.databaseService.organization.findFirst({
        where: { name: createOrganizationDto.name },
      });

    if (existingOrganization) {
      throw HttpExceptionHelper.conflict('Organization name already exists');
    }

    // Create organization
    const organizationData = {
      ...createOrganizationDto,
      logo: createOrganizationDto.logo || null,
      primaryColor: createOrganizationDto.primaryColor || null,
      footerMarkdown: createOrganizationDto.footerMarkdown || null,
    };

    const organization = await this.databaseService.organization.create({
      data: organizationData,
    });

    return plainToInstance(OrganizationResponseDto, organization, {
      excludeExtraneousValues: false,
    });
  }

  async findAll(query: QueryOrganizationDto) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.OrganizationWhereInput = {};

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // Build orderBy clause
    const orderBy: Prisma.OrganizationOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    // Execute queries in parallel
    const [organizations, total] = await Promise.all([
      this.databaseService.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.databaseService.organization.count({ where }),
    ]);

    // Transform organizations to response DTOs
    const transformedOrganizations = organizations.map((organization) =>
      plainToInstance(OrganizationResponseDto, organization, {
        excludeExtraneousValues: false,
      }),
    );

    return {
      organizations: transformedOrganizations,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number): Promise<OrganizationResponseDto> {
    const organization = await this.databaseService.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw HttpExceptionHelper.notFound('Organization not found');
    }

    return plainToInstance(OrganizationResponseDto, organization, {
      excludeExtraneousValues: false,
    });
  }

  async findByName(name: string): Promise<OrganizationResponseDto | null> {
    const organization = await this.databaseService.organization.findFirst({
      where: { name },
    });

    if (!organization) {
      return null;
    }

    return plainToInstance(OrganizationResponseDto, organization, {
      excludeExtraneousValues: false,
    });
  }

  async update(
    id: number,
    updateOrganizationDto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    // Check if organization exists
    const existingOrganization =
      await this.databaseService.organization.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!existingOrganization) {
      throw HttpExceptionHelper.notFound('Organization not found');
    }

    // Check name uniqueness if name is being updated
    if (updateOrganizationDto.name) {
      const nameExists = await this.databaseService.organization.findFirst({
        where: {
          name: updateOrganizationDto.name,
          id: { not: id },
        },
        select: { id: true },
      });

      if (nameExists) {
        throw HttpExceptionHelper.conflict('Organization name already exists');
      }
    }

    // Prepare update data
    const updateData = {
      ...updateOrganizationDto,
      logo:
        updateOrganizationDto.logo === '' ? null : updateOrganizationDto.logo,
      primaryColor:
        updateOrganizationDto.primaryColor === ''
          ? null
          : updateOrganizationDto.primaryColor,
      footerMarkdown:
        updateOrganizationDto.footerMarkdown === ''
          ? null
          : updateOrganizationDto.footerMarkdown,
    };

    const organization = await this.databaseService.organization.update({
      where: { id },
      data: updateData,
    });

    return plainToInstance(OrganizationResponseDto, organization, {
      excludeExtraneousValues: false,
    });
  }

  async remove(id: number): Promise<OrganizationResponseDto> {
    // Check if organization exists
    const existingOrganization =
      await this.databaseService.organization.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!existingOrganization) {
      throw HttpExceptionHelper.notFound('Organization not found');
    }

    const organization = await this.databaseService.organization.delete({
      where: { id },
    });

    return plainToInstance(OrganizationResponseDto, organization, {
      excludeExtraneousValues: false,
    });
  }

  async addMember(
    organizationId: number,
    addMemberDto: AddMemberDto,
  ): Promise<OrganizationMemberResponseDto> {
    // Check if organization exists
    const organization = await this.databaseService.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw HttpExceptionHelper.notFound('Organization not found');
    }

    // Check if user exists
    const user = await this.databaseService.user.findUnique({
      where: { id: addMemberDto.userId },
    });

    if (!user) {
      throw HttpExceptionHelper.notFound('User not found');
    }

    // Check if user is already a member
    const existingMember =
      await this.databaseService.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: addMemberDto.userId,
          },
        },
      });

    if (existingMember) {
      throw HttpExceptionHelper.conflict(
        'User is already a member of this organization',
      );
    }

    // Create member
    const member = await this.databaseService.organizationMember.create({
      data: {
        organizationId,
        userId: addMemberDto.userId,
        role: addMemberDto.role || 'MEMBER',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });

    return plainToInstance(OrganizationMemberResponseDto, member, {
      excludeExtraneousValues: false,
    });
  }

  async getMembers(organizationId: number, query: QueryMembersDto) {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      sortBy = 'joinedAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    // Check if organization exists
    const organization = await this.databaseService.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!organization) {
      throw HttpExceptionHelper.notFound('Organization not found');
    }

    // Build where clause
    const where: Prisma.OrganizationMemberWhereInput = {
      organizationId,
    };

    if (role) {
      where.role = role;
    }

    if (search) {
      where.user = {
        OR: [
          {
            firstName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      };
    }

    // Build orderBy clause
    const orderBy: Prisma.OrganizationMemberOrderByWithRelationInput = {};
    if (sortBy === 'joinedAt' || sortBy === 'role') {
      orderBy[sortBy] = sortOrder as Prisma.SortOrder;
    } else if (sortBy === 'id') {
      orderBy.id = sortOrder as Prisma.SortOrder;
    }

    // Execute queries in parallel
    const [members, total] = await Promise.all([
      this.databaseService.organizationMember.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      }),
      this.databaseService.organizationMember.count({ where }),
    ]);

    // Transform members to response DTOs
    const transformedMembers = members.map((member) =>
      plainToInstance(OrganizationMemberResponseDto, member, {
        excludeExtraneousValues: false,
      }),
    );

    return {
      members: transformedMembers,
      total,
      page,
      limit,
    };
  }

  async getMember(
    organizationId: number,
    memberId: number,
  ): Promise<OrganizationMemberResponseDto> {
    const member = await this.databaseService.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!member) {
      throw HttpExceptionHelper.notFound('Organization or Member not found');
    }

    return plainToInstance(OrganizationMemberResponseDto, member, {
      excludeExtraneousValues: false,
    });
  }

  async updateMemberRole(
    organizationId: number,
    memberId: number,
    updateMemberRoleDto: UpdateMemberRoleDto,
  ): Promise<OrganizationMemberResponseDto> {
    // Check if member exists in organization
    const existingMember =
      await this.databaseService.organizationMember.findFirst({
        where: {
          id: memberId,
          organizationId,
        },
      });

    if (!existingMember) {
      throw HttpExceptionHelper.notFound('Organization or Member not found');
    }

    // Update member role
    const member = await this.databaseService.organizationMember.update({
      where: { id: memberId },
      data: { role: updateMemberRoleDto.role },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
    });

    return plainToInstance(OrganizationMemberResponseDto, member, {
      excludeExtraneousValues: false,
    });
  }

  async removeMember(
    organizationId: number,
    memberId: number,
  ): Promise<OrganizationMemberResponseDto> {
    // Check if member exists in organization
    const existingMember =
      await this.databaseService.organizationMember.findFirst({
        where: {
          id: memberId,
          organizationId,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      });

    if (!existingMember) {
      throw HttpExceptionHelper.notFound('Organization or Member not found');
    }

    // Delete member
    await this.databaseService.organizationMember.delete({
      where: { id: memberId },
    });

    return plainToInstance(OrganizationMemberResponseDto, existingMember, {
      excludeExtraneousValues: false,
    });
  }
}

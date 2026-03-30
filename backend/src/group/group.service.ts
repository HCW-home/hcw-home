import {
  Injectable,
} from '@nestjs/common';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import { DatabaseService } from '../database/database.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { QueryGroupDto } from './dto/query-group.dto';
import { AddMemberToGroupDto } from './dto/add-member-to-group.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class GroupService {
  constructor(private readonly databaseService: DatabaseService) { }

  async create(organizationId: number, createGroupDto: CreateGroupDto) {
    // Verify organization exists
    const organization = await this.databaseService.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw HttpExceptionHelper.notFound('Organization not found');
    }

    // Check if group name already exists in the organization
    const existingGroup = await this.databaseService.group.findFirst({
      where: {
        organizationId,
        name: createGroupDto.name,
      },
    });

    if (existingGroup) {
      throw HttpExceptionHelper.conflict('Group name already exists in this organization');
    }

    const group = await this.databaseService.group.create({
      data: {
        ...createGroupDto,
        organizationId,
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            members: true,
            consultations: true,
          },
        },
      },
    });

    return {
      ...group,
      membersCount: group._count.members,
      consultationsCount: group._count.consultations,
    };
  }

  async findAll(organizationId: number, query: QueryGroupDto) {
    // Verify organization exists
    const organization = await this.databaseService.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw HttpExceptionHelper.notFound('Organization not found');
    }

    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.GroupWhereInput = {
      organizationId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy clause
    const orderBy: Prisma.GroupOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    const [groups, total] = await Promise.all([
      this.databaseService.group.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          organization: {
            select: { id: true, name: true },
          },
          _count: {
            select: {
              members: true,
              consultations: true,
            },
          },
        },
      }),
      this.databaseService.group.count({ where }),
    ]);

    const formattedGroups = groups.map((group) => ({
      ...group,
      membersCount: group._count.members,
      consultationsCount: group._count.consultations,
    }));

    return {
      groups: formattedGroups,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(organizationId: number, id: number) {
    const group = await this.databaseService.group.findFirst({
      where: { id, organizationId },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            members: true,
            consultations: true,
          },
        },
      },
    });

    if (!group) {
      throw HttpExceptionHelper.notFound('Group not found');
    }

    return {
      ...group,
      membersCount: group._count.members,
      consultationsCount: group._count.consultations,
    };
  }

  async update(
    organizationId: number,
    id: number,
    updateGroupDto: UpdateGroupDto,
  ) {
    // Check if group exists in the organization
    const existingGroup = await this.databaseService.group.findFirst({
      where: { id, organizationId },
    });

    if (!existingGroup) {
      throw HttpExceptionHelper.notFound('Group not found');
    }

    // Check if new name conflicts with existing group
    if (updateGroupDto.name && updateGroupDto.name !== existingGroup.name) {
      const conflictingGroup = await this.databaseService.group.findFirst({
        where: {
          organizationId,
          name: updateGroupDto.name,
          id: { not: id },
        },
      });

      if (conflictingGroup) {
        throw HttpExceptionHelper.conflict('Group name already exists in this organization');
      }
    }

    const group = await this.databaseService.group.update({
      where: { id },
      data: updateGroupDto,
      include: {
        organization: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            members: true,
            consultations: true,
          },
        },
      },
    });

    return {
      ...group,
      membersCount: group._count.members,
      consultationsCount: group._count.consultations,
    };
  }

  async remove(organizationId: number, id: number) {
    const group = await this.databaseService.group.findFirst({
      where: { id, organizationId },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            members: true,
            consultations: true,
          },
        },
      },
    });

    if (!group) {
      throw HttpExceptionHelper.notFound('Group not found');
    }

    await this.databaseService.group.delete({
      where: { id },
    });

    return {
      ...group,
      membersCount: group._count.members,
      consultationsCount: group._count.consultations,
    };
  }

  // Group Members Management
  async addMember(
    organizationId: number,
    groupId: number,
    addMemberDto: AddMemberToGroupDto,
  ) {
    const { userId } = addMemberDto;

    // Verify group exists in organization
    const group = await this.databaseService.group.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw HttpExceptionHelper.notFound('Group not found');
    }

    // Verify user exists and is a member of the organization
    const organizationMember =
      await this.databaseService.organizationMember.findFirst({
        where: { organizationId, userId },
        include: { user: true },
      });

    if (!organizationMember) {
      throw HttpExceptionHelper.badRequest('User is not a member of this organization');
    }

    // Check if user is already a member of the group
    const existingMembership = await this.databaseService.groupMember.findFirst(
      {
        where: { groupId, userId },
      },
    );

    if (existingMembership) {
      throw HttpExceptionHelper.conflict('User is already a member of this group');
    }

    const groupMember = await this.databaseService.groupMember.create({
      data: { groupId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return groupMember;
  }

  async removeMember(organizationId: number, groupId: number, userId: number) {
    // Verify group exists in organization
    const group = await this.databaseService.group.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw HttpExceptionHelper.notFound('Group not found');
    }

    const groupMember = await this.databaseService.groupMember.findFirst({
      where: { groupId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!groupMember) {
      throw HttpExceptionHelper.notFound('User is not a member of this group');
    }

    await this.databaseService.groupMember.delete({
      where: { id: groupMember.id },
    });

    return groupMember;
  }

  async getGroupMembers(
    organizationId: number,
    groupId: number,
    query: QueryGroupDto,
  ) {
    // Verify group exists in organization
    const group = await this.databaseService.group.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw HttpExceptionHelper.notFound('Group not found');
    }

    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'joinedAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.GroupMemberWhereInput = {
      groupId,
    };

    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Build orderBy clause
    const orderBy: Prisma.GroupMemberOrderByWithRelationInput = {};
    if (sortBy === 'id') {
      orderBy.id = sortOrder;
    } else {
      orderBy.joinedAt = sortOrder;
    }

    const [members, total] = await Promise.all([
      this.databaseService.groupMember.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.databaseService.groupMember.count({ where }),
    ]);

    return {
      members,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from 'src/database/database.service';
import { successResponse } from 'src/common/helpers/response-helper';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }

  private buildUserInclude() {
    return {
      organizations: {
        include: {
          organization: true,
        },
      },
      groups: {
        include: {
          group: true,
        },
      },
      userLanguages: {
        include: {
          language: true,
        },
      },
      specialties: {
        include: {
          specialty: true,
        },
      },
    };
  }

  private transformUserResponse(user: any): UserResponseDto {
    return new UserResponseDto({
      ...user,
      organizations: user.organizations?.map(rel => rel.organization) || [],
      groups: user.groups?.map(rel => rel.group) || [],
      languages: user.userLanguages?.map(rel => rel.language) || [],
      specialties: user.specialties?.map(rel => rel.specialty) || [],
    });
  }

  async create(createUserDto: CreateUserDto) {
    try {
      const { 
        organizationIds = [], 
        groupIds = [], 
        languageIds = [], 
        specialtyIds = [],
        ...userData 
      } = createUserDto;
      
      // Hash the password
      const hashedPassword = await this.hashPassword(userData.password);
      
      // Ensure temporaryAccount has a value
      const temporaryAccount = userData.temporaryAccount === undefined ? 
        false : userData.temporaryAccount;
      
      // Create user with basic data - using type assertion to bypass TypeScript's type checking
      // since we know the structure is correct based on our schema
      const user = await this.databaseService.user.create({
        data: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          status: userData.status,
          temporaryAccount,
          phoneNumber: userData.phoneNumber || null,
          country: userData.country || null,
          language: userData.language || null,
          sex: userData.sex || null,
        } as Prisma.UserCreateInput,
      });
      
      // Add relationships manually
      await this.updateUserRelationships(
        user.id, 
        organizationIds, 
        groupIds, 
        languageIds, 
        specialtyIds
      );
      
      // Fetch the user with all relationships
      const userWithRelations = await this.databaseService.user.findUnique({
        where: { id: user.id },
        include: this.buildUserInclude(),
      });

      const transformedUser = this.transformUserResponse(userWithRelations);
      return successResponse(transformedUser, 'User successfully created', 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('A user with this email or phone number already exists');
        }
      }
      throw error;
    }
  }
  
  // Helper method to update user relationships
  private async updateUserRelationships(
    userId: number,
    organizationIds?: number[],
    groupIds?: number[],
    languageIds?: number[],
    specialtyIds?: number[],
  ) {
    // Handle organizations
    if (organizationIds?.length) {
      // Create direct SQL query for many-to-many relationships
      for (const orgId of organizationIds) {
        await this.databaseService.$executeRaw`
          INSERT INTO "UserOrganization" ("userId", "organizationId", "createdAt")
          VALUES (${userId}, ${orgId}, ${new Date()})
        `;
      }
    }
    
    // Handle groups
    if (groupIds?.length) {
      for (const groupId of groupIds) {
        await this.databaseService.$executeRaw`
          INSERT INTO "UserGroup" ("userId", "groupId", "createdAt")
          VALUES (${userId}, ${groupId}, ${new Date()})
        `;
      }
    }
    
    // Handle languages
    if (languageIds?.length) {
      for (const langId of languageIds) {
        await this.databaseService.$executeRaw`
          INSERT INTO "UserLanguage" ("userId", "languageId", "createdAt")
          VALUES (${userId}, ${langId}, ${new Date()})
        `;
      }
    }
    
    // Handle specialties
    if (specialtyIds?.length) {
      for (const specId of specialtyIds) {
        await this.databaseService.$executeRaw`
          INSERT INTO "UserSpecialty" ("userId", "specialtyId", "createdAt")
          VALUES (${userId}, ${specId}, ${new Date()})
        `;
      }
    }
  }
  
  // Helper method to clear user relationships
  private async clearUserRelationships(
    userId: number,
    clearOrganizations = false,
    clearGroups = false,
    clearLanguages = false,
    clearSpecialties = false,
  ) {
    if (clearOrganizations) {
      await this.databaseService.$executeRaw`
        DELETE FROM "UserOrganization" WHERE "userId" = ${userId}
      `;
    }
    
    if (clearGroups) {
      await this.databaseService.$executeRaw`
        DELETE FROM "UserGroup" WHERE "userId" = ${userId}
      `;
    }
    
    if (clearLanguages) {
      await this.databaseService.$executeRaw`
        DELETE FROM "UserLanguage" WHERE "userId" = ${userId}
      `;
    }
    
    if (clearSpecialties) {
      await this.databaseService.$executeRaw`
        DELETE FROM "UserSpecialty" WHERE "userId" = ${userId}
      `;
    }
  }

  async findAll() {
    const users = await this.databaseService.user.findMany({
      include: this.buildUserInclude(),
    });
    
    const transformedUsers = users.map(user => this.transformUserResponse(user));
    return successResponse(transformedUsers, 'Users successfully fetched');
  }

  async findOne(id: number) {
    const user = await this.databaseService.user.findUnique({
      where: { id },
      include: this.buildUserInclude(),
    });
    
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    const transformedUser = this.transformUserResponse(user);
    return successResponse(transformedUser, 'User successfully fetched');
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    // First check if user exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { id },
    });
    
    if (!existingUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    const { 
      organizationIds, 
      groupIds, 
      languageIds, 
      specialtyIds,
      password,
      ...userData 
    } = updateUserDto;
    
    // Create update data with type casting to bypass TypeScript errors
    // Since we know these fields exist in the database
    const updateData: any = {};
    
    if (userData.firstName !== undefined) updateData.firstName = userData.firstName;
    if (userData.lastName !== undefined) updateData.lastName = userData.lastName;
    if (userData.email !== undefined) updateData.email = userData.email;
    if (userData.role !== undefined) updateData.role = userData.role;
    if (userData.status !== undefined) updateData.status = userData.status;
    if (userData.temporaryAccount !== undefined) updateData.temporaryAccount = userData.temporaryAccount;
    if (userData.phoneNumber !== undefined) updateData.phoneNumber = userData.phoneNumber;
    if (userData.country !== undefined) updateData.country = userData.country;
    if (userData.language !== undefined) updateData.language = userData.language;
    if (userData.sex !== undefined) updateData.sex = userData.sex;
    
    // Hash password if provided
    if (password) {
      updateData.password = await this.hashPassword(password);
    }
    
    try {
      // Update user basic data
      await this.databaseService.user.update({
        where: { id },
        data: updateData,
      });
      
      // Update relationships if specified
      if (organizationIds !== undefined) {
        await this.clearUserRelationships(id, true, false, false, false);
        if (organizationIds.length > 0) {
          await this.updateUserRelationships(id, organizationIds, [], [], []);
        }
      }
      
      if (groupIds !== undefined) {
        await this.clearUserRelationships(id, false, true, false, false);
        if (groupIds.length > 0) {
          await this.updateUserRelationships(id, [], groupIds, [], []);
        }
      }
      
      if (languageIds !== undefined) {
        await this.clearUserRelationships(id, false, false, true, false);
        if (languageIds.length > 0) {
          await this.updateUserRelationships(id, [], [], languageIds, []);
        }
      }
      
      if (specialtyIds !== undefined) {
        await this.clearUserRelationships(id, false, false, false, true);
        if (specialtyIds.length > 0) {
          await this.updateUserRelationships(id, [], [], [], specialtyIds);
        }
      }
      
      // Fetch the user with all relationships
      const userWithRelations = await this.databaseService.user.findUnique({
        where: { id },
        include: this.buildUserInclude(),
      });
      
      const transformedUser = this.transformUserResponse(userWithRelations);
      return successResponse(transformedUser, 'User successfully updated');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('A user with this email or phone number already exists');
        }
      }
      throw error;
    }
  }

  async remove(id: number) {
    // Check if user exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { id },
    });
    
    if (!existingUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    // Delete user (relations will cascade due to onDelete setting)
    await this.databaseService.user.delete({
      where: { id },
    });
    
    return successResponse(null, `User with ID ${id} successfully deleted`);
  }
}

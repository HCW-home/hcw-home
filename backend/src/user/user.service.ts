import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { successResponse,notFoundResponse,conflictResponse,errorResponse } from 'src/common/helpers/response-helper';
@Injectable()
export class UserService {
  constructor(private readonly databaseService:DatabaseService){}
  
  
  
  async create(data: Prisma.UserCreateInput) {
    try {
      // Check if user already exists
      const existingUser = await this.databaseService.user.findUnique({
        where: { email: data.email },
      });
  
      if (existingUser) {
        return conflictResponse("User with this email already exists");
      }
  
      // Create the user
      const user = await this.databaseService.user.create({ data });
  
      return successResponse(user, "User successfully created", HttpStatus.CREATED);
    } catch (error) {
      return errorResponse("Failed to create user", error.message);
    }
  }


  async findAll() {
    const users= await this.databaseService.user.findMany();
    return successResponse(users, "users sucessfully fetched")
  }



  async findOneById(id: number) {
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });
  
    // Check if user is null and return proper message
    if (!user) {
      return notFoundResponse(`User with email ${id} not found`);

    }
    return successResponse(user, "User fetched successfully", HttpStatus.OK);
  }


  async findOneByEmail(email: string) {
    const user = await this.databaseService.user.findUnique({
      where: { email },
    });
  
    if (!user) {
      return notFoundResponse(`User with email ${email} not found`);
    }
  
    return successResponse(user, "User fetched successfully", HttpStatus.OK);
  }
  
  
  // update(id: number) {
  //   return `This action updates a #${id} user`;
  // }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}

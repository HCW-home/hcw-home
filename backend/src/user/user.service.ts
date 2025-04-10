import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import { successResponse } from 'src/common/helpers/response-helper';
@Injectable()
export class UserService {
  constructor(private readonly databaseService:DatabaseService){}
  
  
  
  async create(data:Prisma.UserCreateInput) {
    const user= await this.databaseService.user.create({data});
    return successResponse(user, "user sucessfully created", 201)
  }

  async findAll() {
    const users= await this.databaseService.user.findMany();
    return successResponse(users, "users sucessfully fetched")
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  // update(id: number) {
  //   return `This action updates a #${id} user`;
  // }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}

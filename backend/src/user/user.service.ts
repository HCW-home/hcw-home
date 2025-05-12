import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { successResponse } from '../common/helpers/response-helper';

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: Prisma.UserCreateArgs['data']) {
    const user = await this.databaseService.user.create({ data });
    return successResponse(user, 'User successfully created', 201);
  }

  async findAll() {
    const users = await this.databaseService.user.findMany();
    return successResponse(users, 'Users successfully fetched');
  }

  async findOne(id: number) {
    const user = await this.databaseService.user.findUnique({ where: { id } });
    return successResponse(user, 'User fetched');
  }

  async remove(id: number) {
    await this.databaseService.user.delete({ where: { id } });
    return successResponse(null, `User with id ${id} deleted`);
  }

  /**
   * Validate user by phoneNumber and password.
   * In real apps, password must be hashed (bcrypt.compare).
   */
  async validateUser(
    phoneNumber: string,
    password: string,
  ): Promise<{ id: number; role: string } | null> {
    const user = await this.databaseService.user.findUnique({
      where: { phoneNumber },
    });

    if (!user || user.password !== password) {
      return null;
    }

    return { id: user.id, role: user.role };
  }
}

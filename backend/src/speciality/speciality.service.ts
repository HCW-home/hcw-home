import { Injectable, Logger } from '@nestjs/common';
import { CreateSpecialityDto } from './dto/create-speciality.dto';
import { UpdateSpecialityDto } from './dto/update-speciality.dto';
import { DatabaseService } from 'src/database/database.service';
import { GetSpecialityDto } from './dto/get-speciality.dto';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';

@Injectable()
export class SpecialityService {
  private readonly logger = new Logger(SpecialityService.name);

  constructor(private prisma: DatabaseService) { }

  create(data: CreateSpecialityDto) {
    return this.prisma.speciality.create({ data });
  }

  async findAll(): Promise<GetSpecialityDto[]> {
    return await this.prisma.speciality.findMany({
      orderBy: {
        name: 'asc',
      }
    });
  }

  findOne(id: number) {
    return this.prisma.speciality.findUnique({ where: { id } });
  }

  async update(id: number, data: UpdateSpecialityDto) {
    const existing = await this.prisma.speciality.findUnique({ where: { id } });
    if (!existing) throw HttpExceptionHelper.notFound('Speciality not found');
    return this.prisma.speciality.update({ where: { id }, data });
  }

  async remove(id: number) {
    const existing = await this.prisma.speciality.findUnique({ where: { id } });
    if (!existing) throw HttpExceptionHelper.notFound('Speciality not found');
    return this.prisma.speciality.delete({ where: { id } });
  }
}

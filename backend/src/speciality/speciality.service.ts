import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSpecialityDto } from './dto/create-speciality.dto';
import { UpdateSpecialityDto } from './dto/update-speciality.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class SpecialityService {
  constructor(private prisma: DatabaseService) {}

  create(data: CreateSpecialityDto) {
    return this.prisma.speciality.create({ data });
  }

  findAll() {
    return this.prisma.speciality.findMany();
  }

  findOne(id: number) {
    return this.prisma.speciality.findUnique({ where: { id } });
  }

  async update(id: number, data: UpdateSpecialityDto) {
    const existing = await this.prisma.speciality.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Speciality not found');
    return this.prisma.speciality.update({ where: { id }, data });
  }

  async remove(id: number) {
    const existing = await this.prisma.speciality.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Speciality not found');
    return this.prisma.speciality.delete({ where: { id } });
  }
}
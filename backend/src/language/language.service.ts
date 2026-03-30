import { Injectable } from '@nestjs/common';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class LanguageService {
  constructor(private prisma: DatabaseService) { }

  create(data: CreateLanguageDto) {
    return this.prisma.language.create({ data });
  }

  findAll() {
    return this.prisma.language.findMany();
  }

  findOne(id: number) {
    return this.prisma.language.findUnique({ where: { id } });
  }

  async update(id: number, data: UpdateLanguageDto) {
    const existing = await this.prisma.language.findUnique({ where: { id } });
    if (!existing) throw HttpExceptionHelper.notFound('Language not found');
    return this.prisma.language.update({ where: { id }, data });
  }

  async remove(id: number) {
    const existing = await this.prisma.language.findUnique({ where: { id } });
    if (!existing) throw HttpExceptionHelper.notFound('Language not found');
    return this.prisma.language.delete({ where: { id } });
  }
}

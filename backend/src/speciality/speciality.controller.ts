import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SpecialityService } from './speciality.service';
import { CreateSpecialityDto } from './dto/create-speciality.dto';
import { UpdateSpecialityDto } from './dto/update-speciality.dto';
import { GetSpecialityDto } from './dto/get-speciality.dto';
@Controller('speciality')
export class SpecialityController {
  constructor(private readonly service: SpecialityService) { }

  @Post()
  create(@Body() dto: CreateSpecialityDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<GetSpecialityDto[]> {
    const res = this.service.findAll();
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSpecialityDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}

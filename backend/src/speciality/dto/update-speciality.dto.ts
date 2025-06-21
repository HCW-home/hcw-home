import { PartialType } from '@nestjs/swagger';
import { CreateSpecialityDto } from './create-speciality.dto';

export class UpdateSpecialityDto extends PartialType(CreateSpecialityDto) {}

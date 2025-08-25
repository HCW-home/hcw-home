import { PartialType } from '@nestjs/swagger';
import { CreateWhatsappTemplateDto } from './create-whatsapp-template.dto';

export class UpdateWhatsappTemplateDto extends PartialType(CreateWhatsappTemplateDto) {}

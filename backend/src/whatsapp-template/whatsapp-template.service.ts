import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { QueryWhatsappTemplateDto } from './dto/query-whatsapp-template.dto';
import { WhatsappTemplateResponseDto } from './dto/whatsapp-template-response.dto';
import { plainToInstance } from 'class-transformer';
import { ApprovalStatus, Category, Prisma } from '@prisma/client';

@Injectable()
export class WhatsappTemplateService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(
    createWhatsappTemplateDto: CreateWhatsappTemplateDto,
  ): Promise<WhatsappTemplateResponseDto> {
    // Check if template key already exists (if provided)
    if (createWhatsappTemplateDto.key) {
      const existingTemplate =
        await this.databaseService.whatsapp_Template.findFirst({
          where: { key: createWhatsappTemplateDto.key },
        });

      if (existingTemplate) {
        throw new ConflictException('Template key already exists');
      }
    }

    // Prepare template data
    const templateData = {
      ...createWhatsappTemplateDto,
      sid: createWhatsappTemplateDto.sid || null,
      key: createWhatsappTemplateDto.key || null,
      category: createWhatsappTemplateDto.category || null,
      contentType: createWhatsappTemplateDto.contentType || null,
      variables: createWhatsappTemplateDto.variables || {},
      types: createWhatsappTemplateDto.types || Prisma.JsonNull,
      url: createWhatsappTemplateDto.url || null,
      actions: createWhatsappTemplateDto.actions || Prisma.JsonNull,
      approvalStatus: createWhatsappTemplateDto.approvalStatus || 'DRAFT',
      rejectionReason: createWhatsappTemplateDto.rejectionReason || null,
    };

    const template = await this.databaseService.whatsapp_Template.create({
      data: templateData,
    });

    return plainToInstance(WhatsappTemplateResponseDto, template, {
      excludeExtraneousValues: false,
    });
  }

  async findAll(query: QueryWhatsappTemplateDto) {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      approvalStatus,
      language,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.Whatsapp_TemplateWhereInput = {};

    if (search) {
      where.OR = [
        {
          friendlyName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          key: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (category) {
      where.category = {
        equals: category as Category,
      };
    }

    if (approvalStatus) {
      where.approvalStatus = approvalStatus as ApprovalStatus;
    }

    if (language) {
      where.language = {
        contains: language,
        mode: 'insensitive',
      };
    }

    // Build orderBy clause
    const orderBy: Prisma.Whatsapp_TemplateOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    // Execute queries in parallel
    const [templates, total] = await Promise.all([
      this.databaseService.whatsapp_Template.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.databaseService.whatsapp_Template.count({ where }),
    ]);

    // Transform templates to response DTOs
    const transformedTemplates = templates.map((template) =>
      plainToInstance(WhatsappTemplateResponseDto, template, {
        excludeExtraneousValues: false,
      }),
    );

    return {
      templates: transformedTemplates,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number): Promise<WhatsappTemplateResponseDto> {
    const template = await this.databaseService.whatsapp_Template.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('WhatsApp template not found');
    }

    return plainToInstance(WhatsappTemplateResponseDto, template, {
      excludeExtraneousValues: false,
    });
  }

  async findBySid(sid: string): Promise<WhatsappTemplateResponseDto | null> {
    const template = await this.databaseService.whatsapp_Template.findFirst({
      where: { sid },
    });

    if (!template) {
      return null;
    }

    return plainToInstance(WhatsappTemplateResponseDto, template, {
      excludeExtraneousValues: false,
    });
  }

  async update(
    id: number,
    updateWhatsappTemplateDto: UpdateWhatsappTemplateDto,
  ): Promise<WhatsappTemplateResponseDto> {
    // Check if template exists
    const existingTemplate =
      await this.databaseService.whatsapp_Template.findUnique({
        where: { id },
        select: { id: true, key: true },
      });

    if (!existingTemplate) {
      throw new NotFoundException('WhatsApp template not found');
    }

    // Check key uniqueness if key is being updated
    if (
      updateWhatsappTemplateDto.key &&
      updateWhatsappTemplateDto.key !== existingTemplate.key
    ) {
      const keyExists = await this.databaseService.whatsapp_Template.findFirst({
        where: {
          key: updateWhatsappTemplateDto.key,
          id: { not: id },
        },
        select: { id: true },
      });

      if (keyExists) {
        throw new ConflictException('Template key already exists');
      }
    }

    // Prepare update data
    const updateData = {
      ...updateWhatsappTemplateDto,
      sid:
        updateWhatsappTemplateDto.sid === ''
          ? null
          : updateWhatsappTemplateDto.sid,
      key:
        updateWhatsappTemplateDto.key === ''
          ? null
          : updateWhatsappTemplateDto.key,
      contentType:
        updateWhatsappTemplateDto.contentType === ''
          ? null
          : updateWhatsappTemplateDto.contentType,
      url:
        updateWhatsappTemplateDto.url === ''
          ? null
          : updateWhatsappTemplateDto.url,
      rejectionReason:
        updateWhatsappTemplateDto.rejectionReason === ''
          ? null
          : updateWhatsappTemplateDto.rejectionReason,
    };

    const template = await this.databaseService.whatsapp_Template.update({
      where: { id },
      data: updateData,
    });

    return plainToInstance(WhatsappTemplateResponseDto, template, {
      excludeExtraneousValues: false,
    });
  }

  async remove(id: number): Promise<WhatsappTemplateResponseDto> {
    // Check if template exists
    const existingTemplate =
      await this.databaseService.whatsapp_Template.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!existingTemplate) {
      throw new NotFoundException('WhatsApp template not found');
    }

    const template = await this.databaseService.whatsapp_Template.delete({
      where: { id },
    });

    return plainToInstance(WhatsappTemplateResponseDto, template, {
      excludeExtraneousValues: false,
    });
  }

 
}

import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import { DatabaseService } from '../database/database.service';
import { TwilioWhatsappService } from './twilio-template.service';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { QueryWhatsappTemplateDto } from './dto/query-whatsapp-template.dto';
import { WhatsappTemplateResponseDto } from './dto/whatsapp-template-response.dto';
import { plainToInstance } from 'class-transformer';
import { ApprovalStatus, Category, Prisma } from '@prisma/client';

export interface BulkSubmitResult {
  successful: {
    id: number;
    sid: string;
    approvalResponse: any;
  }[];
  failed: {
    id: number;
    error: string;
  }[];
}

export interface SyncResult {
  created: number;
  updated: number;
  errors: string[];
}

@Injectable()
export class WhatsappTemplateService {
  private readonly logger = new Logger(WhatsappTemplateService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly twilioWhatsappService: TwilioWhatsappService,
  ) { }

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
        throw HttpExceptionHelper.conflict('Template key already exists');
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
      throw HttpExceptionHelper.notFound('WhatsApp template not found');
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
      });

    if (!existingTemplate) {
      throw HttpExceptionHelper.notFound('WhatsApp template not found');
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
        throw HttpExceptionHelper.conflict('Template key already exists');
      }
    }

    // Save current version to history table
    await this.databaseService.$executeRawUnsafe(
      `INSERT INTO "Whatsapp_Template_History" ("templateId", "version", "data") VALUES ($1, $2, $3)`,
      id,
      existingTemplate.version || 1,
      JSON.stringify(existingTemplate)
    );

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
      version: (existingTemplate.version || 1) + 1,
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
      throw HttpExceptionHelper.notFound('WhatsApp template not found');
    }

    // Update status to DRAFT instead of deleting
    const template = await this.databaseService.whatsapp_Template.update({
      where: { id },
      data: {
        approvalStatus: 'DRAFT',
        rejectionReason: 'Template marked as deleted',
      },
    });

    return plainToInstance(WhatsappTemplateResponseDto, template, {
      excludeExtraneousValues: false,
    });
  }

  /**
   * Submit a single template for approval to Twilio
   */
  async submitForApproval(id: number): Promise<WhatsappTemplateResponseDto> {
    const template = await this.databaseService.whatsapp_Template.findUnique({
      where: { id },
    });

    if (!template) {
      throw HttpExceptionHelper.notFound('WhatsApp template not found');
    }

    if (!template.key) {
      throw HttpExceptionHelper.badRequest('Template must have a key to submit for approval');
    }

    if (!template.category) {
      throw HttpExceptionHelper.badRequest('Template must have a category to submit for approval');
    }

    try {
      let templateSid = template.sid;

      // If template doesn't have SID, create it in Twilio first
      if (!templateSid) {
        this.logger.log(
          `Template ${id} doesn't have SID, creating in Twilio first`,
        );

        const twilioResponse = await this.twilioWhatsappService.createTemplate({
          friendlyName: template.key,
          language: template.language || 'en',
          body: template.friendlyName || '',
          category: template.category,
          contentType: template.contentType || 'twilio/text',
          variables: template.variables,
          actions: template.actions,
        });

        templateSid = twilioResponse.sid;

        // Update template with SID
        await this.databaseService.whatsapp_Template.update({
          where: { id },
          data: { sid: templateSid },
        });

        this.logger.log(
          `Template ${id} created in Twilio with SID: ${templateSid}`,
        );
      }

      // Submit to Twilio for approval
      const approvalResponse =
        await this.twilioWhatsappService.submitTemplateForApproval({
          sid: templateSid,
          name: template.key,
          category: template.category,
        });

      // Update status in database
      const updatedTemplate =
        await this.databaseService.whatsapp_Template.update({
          where: { id },
          data: {
            sid: templateSid, // Ensure SID is saved
            approvalStatus: ApprovalStatus.PENDING,
            rejectionReason: null,
          },
        });

      this.logger.log(`Template ${id} submitted for approval successfully`);

      return plainToInstance(WhatsappTemplateResponseDto, updatedTemplate, {
        excludeExtraneousValues: false,
      });
    } catch (error) {
      this.logger.error(
        `Failed to submit template ${id} for approval: ${error.message}`,
      );
      throw HttpExceptionHelper.badRequest(`Failed to submit template for approval: ${error.message}`);
    }
  }

  /**
   * Bulk submit templates for approval
   */
  async bulkSubmitForApproval(
    templateIds: number[],
  ): Promise<BulkSubmitResult> {
    const successful: BulkSubmitResult['successful'] = [];
    const failed: BulkSubmitResult['failed'] = [];

    // Get all templates
    const templates = await this.databaseService.whatsapp_Template.findMany({
      where: {
        id: { in: templateIds },
      },
    });

    // Process each template individually
    for (const template of templates) {
      try {
        // Validate required fields
        if (!template.key || !template.category) {
          failed.push({
            id: template.id,
            error: 'Template must have key and category to submit for approval',
          });
          continue;
        }

        let templateSid = template.sid;

        // If template doesn't have SID, create it in Twilio first
        if (!templateSid) {
          this.logger.log(
            `Template ${template.id} doesn't have SID, creating in Twilio first`,
          );

          const twilioResponse =
            await this.twilioWhatsappService.createTemplate({
              friendlyName: template.key,
              language: template.language || 'en',
              body: template.friendlyName || '',
              category: template.category,
              contentType: template.contentType || 'twilio/text',
              variables: template.variables,
              actions: template.actions,
            });

          templateSid = twilioResponse.sid;

          // Update template with SID
          await this.databaseService.whatsapp_Template.update({
            where: { id: template.id },
            data: { sid: templateSid },
          });

          this.logger.log(
            `Template ${template.id} created in Twilio with SID: ${templateSid}`,
          );
        }

        // Submit to Twilio for approval
        const approvalResponse =
          await this.twilioWhatsappService.submitTemplateForApproval({
            sid: templateSid,
            name: template.key,
            category: template.category,
          });

        // Update status in database
        await this.databaseService.whatsapp_Template.update({
          where: { id: template.id },
          data: {
            sid: templateSid, // Ensure SID is saved
            approvalStatus: ApprovalStatus.PENDING,
            rejectionReason: null,
          },
        });

        successful.push({
          id: template.id,
          sid: templateSid,
          approvalResponse: approvalResponse,
        });

        this.logger.log(
          `Template ${template.id} submitted for approval successfully`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to submit template ${template.id} for approval: ${error.message}`,
        );
        failed.push({
          id: template.id,
          error: error.message,
        });
      }
    }

    this.logger.log(
      `Bulk submission completed: ${successful.length} successful, ${failed.length} failed`,
    );

    return { successful, failed };
  }

  async deleteTemplate(
    id: number,
    deleteFromTwilio: boolean = true,
  ): Promise<{ message: string }> {
    const template = await this.databaseService.whatsapp_Template.findUnique({
      where: { id },
    });

    if (!template) {
      throw HttpExceptionHelper.notFound('WhatsApp template not found');
    }

    try {
      // Delete from Twilio if SID exists and requested
      if (deleteFromTwilio && template.sid) {
        await this.twilioWhatsappService.deleteTemplate(template.sid);
      }

      // Delete from database
      await this.databaseService.whatsapp_Template.delete({
        where: { id },
      });

      this.logger.log(`Template ${id} deleted successfully`);
      return { message: 'Template deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete template ${id}: ${error.message}`);
      throw HttpExceptionHelper.badRequest(`Failed to delete template: ${error.message}`);
    }
  }

  /**
   * Sync templates from Twilio
   */
  async syncFromTwilio(): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      errors: [],
    };

    try {
      // Get all templates from Twilio
      const twilioTemplates =
        await this.twilioWhatsappService.getAllTemplates();

      for (const twilioTemplate of twilioTemplates) {
        try {
          // Check if template exists in database
          const existingTemplate =
            await this.databaseService.whatsapp_Template.findFirst({
              where: { sid: twilioTemplate.sid },
            });

          if (existingTemplate) {
            // Update existing template
            await this.databaseService.whatsapp_Template.update({
              where: { id: existingTemplate.id },
              data: {
                friendlyName: twilioTemplate.friendlyName,
                language: twilioTemplate.language,
                variables: twilioTemplate.variables,
                types: twilioTemplate.types,
                url: twilioTemplate.url,
                updatedAt: new Date(),
              },
            });
            result.updated++;
          } else {
            // Create new template
            await this.databaseService.whatsapp_Template.create({
              data: {
                sid: twilioTemplate.sid,
                friendlyName: twilioTemplate.friendlyName,
                language: twilioTemplate.language,
                variables: twilioTemplate.variables,
                types: twilioTemplate.types,
                url: twilioTemplate.url,
                approvalStatus: ApprovalStatus.UNKNOWN,
              },
            });
            result.created++;
          }
        } catch (error) {
          result.errors.push(
            `Failed to sync template ${twilioTemplate.sid}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Sync completed: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Sync failed: ${error.message}`);
      result.errors.push(`Sync operation failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Sync approval status for templates
   */
  async syncApprovalStatus(): Promise<{ updated: number; errors: string[] }> {
    const result = { updated: 0, errors: [] };

    try {
      // Get all templates with SIDs that need status updates
      const templates = await this.databaseService.whatsapp_Template.findMany({
        where: {
          sid: { not: null },
          approvalStatus: {
            in: [ApprovalStatus.PENDING, ApprovalStatus.UNKNOWN],
          },
        },
      });

      for (const template of templates) {
        try {
          // Get approval status for this template
          const statusResponse =
            await this.twilioWhatsappService.getTemplateApprovalStatus(
              template.sid!,
            );

          const newStatus = this.twilioWhatsappService.mapTwilioStatusToEnum(
            statusResponse.status,
          );

          // Update template status
          await this.databaseService.whatsapp_Template.update({
            where: { id: template.id },
            data: {
              approvalStatus: newStatus,
              rejectionReason: statusResponse.rejectionReason,
            },
          });

          result.updated++;
        } catch (error) {
          throw `Failed to sync approval status for template ${template.id}: ${error.message}`;
        }
      }

      this.logger.log(
        `Approval status sync completed: ${result.updated} updated, ${result.errors.length} errors`,
      );
      return result;
    } catch (error) {
      throw `Approval status sync operation failed: ${error.message}`;
    }
  }

  /**
   * Get all templates with pagination
   */
  async getAllTemplates(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: WhatsappTemplateResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      this.databaseService.whatsapp_Template.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.whatsapp_Template.count(),
    ]);

    return {
      data: templates.map((template) =>
        plainToInstance(WhatsappTemplateResponseDto, template, {
          excludeExtraneousValues: false,
        }),
      ),
      total,
      page,
      limit,
    };
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: number): Promise<WhatsappTemplateResponseDto> {
    const template = await this.databaseService.whatsapp_Template.findUnique({
      where: { id },
    });

    if (!template) {
      throw HttpExceptionHelper.notFound('WhatsApp template not found');
    }

    return plainToInstance(WhatsappTemplateResponseDto, template, {
      excludeExtraneousValues: false,
    });
  }

  /**
   * Update template
   */
  async updateTemplate(
    id: number,
    dto: Partial<CreateWhatsappTemplateDto>,
  ): Promise<WhatsappTemplateResponseDto> {
    const template = await this.databaseService.whatsapp_Template.findUnique({
      where: { id },
    });

    if (!template) {
      throw HttpExceptionHelper.notFound('WhatsApp template not found');
    }

    // Validate category if provided
    if (
      dto.category &&
      !this.twilioWhatsappService.validateCategory(dto.category)
    ) {
      throw HttpExceptionHelper.badRequest('Invalid category. Must be UTILITY, MARKETING, or AUTHENTICATION');
    }

    const updatedTemplate = await this.databaseService.whatsapp_Template.update(
      {
        where: { id },
        data: {
          ...dto,
          updatedAt: new Date(),
        },
      },
    );

    return plainToInstance(WhatsappTemplateResponseDto, updatedTemplate, {
      excludeExtraneousValues: false,
    });
  }
}

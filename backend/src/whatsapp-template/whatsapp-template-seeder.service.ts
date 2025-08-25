import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { DatabaseService } from '../database/database.service';
import { ApprovalStatus, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

interface TemplateAction {
  title: string;
  url: string;
  type: string;
}

interface TemplateDefinition {
  key: string;
  category: string;
  contentType: string;
  actions?: TemplateAction[];
  variables?: Record<string, any>;
  sid?: string;
  language?: string;
  friendlyName?: string;
}

interface TemplateConfig {
  requiredTemplates: TemplateDefinition[];
}

@Injectable()
export class WhatsappTemplateSeederService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappTemplateSeederService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('Starting WhatsApp template seeding...');
      await this.seedTemplates();
    } catch (error) {
      this.logger.error('Failed to seed WhatsApp templates', error);
    }
  }

  private async seedTemplates(): Promise<void> {
    const templateFilePath = this.getTemplateFilePath();
    
    if (!fs.existsSync(templateFilePath)) {
      this.logger.warn(`Template file not found: ${templateFilePath}`);
      this.logger.warn('Skipping template seeding. Create the file to enable automatic template loading.');
      return;
    }

    try {
      // Read and parse JSON file
      const fileContent = fs.readFileSync(templateFilePath, 'utf8');
      const templateConfig: TemplateConfig = JSON.parse(fileContent);

      if (!templateConfig || !Array.isArray(templateConfig.requiredTemplates)) {
        this.logger.error('Template file must contain an object with "requiredTemplates" array');
        return;
      }

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      this.logger.log(`Processing ${templateConfig.requiredTemplates.length} template definitions...`);

      for (const templateDef of templateConfig.requiredTemplates) {
        try {
          const result = await this.processTemplate(templateDef);
          
          switch (result) {
            case 'created':
              createdCount++;
              break;
            case 'updated':
              updatedCount++;
              break;
            case 'skipped':
              skippedCount++;
              break;
          }
        } catch (error) {
          this.logger.error(
            `Failed to process template with key: ${templateDef.key}`,
            error,
          );
        }
      }

      this.logger.log(
        `✅ Template seeding completed successfully!`
      );
      this.logger.log(
        `📊 Summary: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped (approved templates)`
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.logger.error('Invalid JSON format in template file', error);
      } else {
        this.logger.error('Failed to load template file', error);
      }
    }
  }

  private async processTemplate(
    templateDef: TemplateDefinition,
  ): Promise<'created' | 'updated' | 'skipped'> {
    if (!templateDef.key) {
      this.logger.warn('Template missing key, skipping');
      return 'skipped';
    }

    // Check if template with this key already exists
    const existingTemplate = await this.databaseService.whatsapp_Template.findFirst({
      where: { key: templateDef.key },
      select: {
        id: true,
        key: true,
        approvalStatus: true,
        sid: true,
        friendlyName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (existingTemplate) {
      // Don't update approved templates
      if (existingTemplate.approvalStatus === ApprovalStatus.APPROVED) {
        this.logger.debug(
          `⏭️  Skipping approved template: ${templateDef.key}`,
        );
        return 'skipped';
      }

      // Update existing draft template
      await this.updateExistingTemplate(existingTemplate.id, templateDef);
      this.logger.debug(`🔄 Updated template: ${templateDef.key}`);
      return 'updated';
    } else {
      // Create new template
      await this.createNewTemplate(templateDef);
      this.logger.debug(`➕ Created template: ${templateDef.key}`);
      return 'created';
    }
  }

  private async createNewTemplate(templateDef: TemplateDefinition): Promise<void> {
    const templateData = this.prepareTemplateData(templateDef);
    
    await this.databaseService.whatsapp_Template.create({
      data: templateData,
    });
  }

  private async updateExistingTemplate(
    id: number,
    templateDef: TemplateDefinition,
  ): Promise<void> {
    const templateData = this.prepareTemplateData(templateDef, true);
    
    await this.databaseService.whatsapp_Template.update({
      where: { id },
      data: templateData,
    });
  }

  private prepareTemplateData(
    templateDef: TemplateDefinition,
    isUpdate: boolean = false,
  ): any {
    // Generate types array based on variables
    const types: string[] = [];
    if (templateDef.variables) {
      Object.keys(templateDef.variables).forEach(() => {
        types.push('TEXT'); // Default to TEXT type
      });
    }

    // Process actions to resolve environment variables
    let processedActions: { url: any; title: string; type: string; }[] = [];
    if (templateDef.actions && Array.isArray(templateDef.actions)) {
      processedActions = templateDef.actions.map(action => ({
        ...action,
        url: this.resolveEnvironmentVariables(action.url),
      }));
    }

    // Process variables to resolve environment variables
    let processedVariables = {};
    if (templateDef.variables) {
      processedVariables = Object.keys(templateDef.variables).reduce((acc, key) => {
        acc[key] = this.resolveEnvironmentVariables(templateDef.variables![key]);
        return acc;
      }, {});
    }

    const baseData = {
      key: templateDef.key,
      friendlyName: templateDef.friendlyName || this.formatFriendlyName(templateDef.key),
      language: templateDef.language || 'en', // Default to English
      category: this.mapCategory(templateDef.category),
      contentType: templateDef.contentType || 'text',
      variables: processedVariables,
      types: types.length > 0 ? types : Prisma.JsonNull,
      url: null,
      actions: processedActions ? processedActions : Prisma.JsonNull,
      sid: templateDef.sid || null,
      approvalStatus: ApprovalStatus.DRAFT,
      rejectionReason: null,
    };

    // Add updatedAt for updates
    if (isUpdate) {
      baseData['updatedAt'] = new Date();
    }

    return baseData;
  }

  private resolveEnvironmentVariables(value: any): any {
    if (typeof value !== 'string') {
      return value;
    }

    // Replace environment variables in the string
    return value.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      return process.env[envVar] || match;
    });
  }

  private formatFriendlyName(key: string): string {
    // Convert key to proper case
    return key
      .split(/[\s_-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private mapCategory(category: string): string {
    // Map your custom categories to standard WhatsApp categories
    const categoryMap: Record<string, string> = {
      'UTILITY': 'UTILITY',
      'MARKETING': 'MARKETING',
      'AUTHENTICATION': 'AUTHENTICATION',
      'TRANSACTIONAL': 'UTILITY', // Map transactional to utility
    };

    const mappedCategory = categoryMap[category?.toUpperCase()];
    if (!mappedCategory) {
      this.logger.warn(`Unknown category: ${category}, defaulting to UTILITY`);
      return 'UTILITY';
    }
    
    return mappedCategory;
  }

  private getTemplateFilePath(): string {
    // Try to get from config first, fallback to default
    const configPath = this.configService.whatsappTemplatesPathFromEnv;
    
    if (configPath) {
      return path.resolve(configPath);
    }

    // Use the default path from configuration
    return path.resolve(process.cwd(), this.configService.whatsappTemplatesPath);
  }

  // Method to manually trigger seeding (useful for development/testing)
  async forceSeedTemplates(): Promise<{ 
    created: number; 
    updated: number; 
    skipped: number; 
    total: number; 
  }> {
    this.logger.log('🔄 Manually triggering template seeding...');
    
    const templateFilePath = this.getTemplateFilePath();
    
    if (!fs.existsSync(templateFilePath)) {
      throw new Error(`Template file not found: ${templateFilePath}`);
    }

    const fileContent = fs.readFileSync(templateFilePath, 'utf8');
    const templateConfig: TemplateConfig = JSON.parse(fileContent);

    if (!templateConfig || !Array.isArray(templateConfig.requiredTemplates)) {
      throw new Error('Template file must contain an object with "requiredTemplates" array');
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const templateDef of templateConfig.requiredTemplates) {
      const result = await this.processTemplate(templateDef);
      
      switch (result) {
        case 'created':
          createdCount++;
          break;
        case 'updated':
          updatedCount++;
          break;
        case 'skipped':
          skippedCount++;
          break;
      }
    }

    return {
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      total: templateConfig.requiredTemplates.length,
    };
  }

  // Method to get processed template by key (useful for runtime)
  async getProcessedTemplate(key: string): Promise<any> {
    const template = await this.databaseService.whatsapp_Template.findFirst({
      where: { key },
    });

    if (!template) {
      return null;
    }

    // Return template with resolved variables and actions
    return {
      ...template,
      variables: template.variables,
      actions: template.actions,
    };
  }

  // Method to validate template file without processing
  async validateTemplateFile(): Promise<{
    valid: boolean;
    errors: string[];
    templateCount: number;
  }> {
    const templateFilePath = this.getTemplateFilePath();
    const errors: string[] = [];

    if (!fs.existsSync(templateFilePath)) {
      return {
        valid: false,
        errors: [`Template file not found: ${templateFilePath}`],
        templateCount: 0,
      };
    }

    try {
      const fileContent = fs.readFileSync(templateFilePath, 'utf8');
      const templateConfig: TemplateConfig = JSON.parse(fileContent);

      if (!templateConfig || !Array.isArray(templateConfig.requiredTemplates)) {
        errors.push('Template file must contain an object with "requiredTemplates" array');
        return { valid: false, errors, templateCount: 0 };
      }

      // Validate each template
      templateConfig.requiredTemplates.forEach((template, index) => {
        if (!template.key) {
          errors.push(`Template at index ${index} is missing required "key" field`);
        }
        if (!template.category) {
          errors.push(`Template "${template.key}" is missing required "category" field`);
        }
        if (template.category && !['UTILITY', 'MARKETING', 'AUTHENTICATION', 'TRANSACTIONAL'].includes(template.category.toUpperCase())) {
          errors.push(`Template "${template.key}" has invalid category: ${template.category}`);
        }
      });

      return {
        valid: errors.length === 0,
        errors,
        templateCount: templateConfig.requiredTemplates.length,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        errors.push('Invalid JSON format in template file');
      } else {
        errors.push(`Failed to read template file: ${error.message}`);
      }
      return { valid: false, errors, templateCount: 0 };
    }
  }
}
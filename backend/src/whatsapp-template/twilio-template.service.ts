import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as twilio from 'twilio';
import { ContentInstance } from 'twilio/lib/rest/content/v1/content';
import axios from 'axios';

export interface CreateTemplatePayload {
  friendlyName: string;
  language: string;
  body: string;
  category: string;
  contentType: string;
  variables?: any;
  actions?: any;
}

export interface SubmitApprovalPayload {
  sid: string;
  name: string;
  category: string;
}

export interface TwilioTemplateResponse {
  sid: string;
  friendlyName: string;
  language: string;
  variables: any;
  types: any;
  url: string;
  dateCreated: string;
  dateUpdated: string;
}

export interface ApprovalResponse {
  name: string;
  category: string;
  content_sid: string;
  status: string;
  date_created: string;
  date_updated: string;
}

export interface ApprovalStatusResponse {
  status: string;
  rejectionReason: string | null;
}

@Injectable()
export class TwilioWhatsappService {
  private readonly logger = new Logger(TwilioWhatsappService.name);
  private twilioClient: twilio.Twilio;
  private accountSid: string;
  private authToken: string;

  constructor(private configService: ConfigService) {
    this.accountSid = this.configService.twilioAccountSid;
    this.authToken = this.configService.twilioAuthToken;
    this.twilioClient = twilio(this.accountSid, this.authToken);
  }

  /**
   * Convert ContentInstance to TwilioTemplateResponse
   */
  private mapContentInstanceToResponse(instance: ContentInstance): TwilioTemplateResponse {
    return {
      sid: instance.sid,
      friendlyName: instance.friendlyName,
      language: instance.language,
      variables: instance.variables,
      types: instance.types,
      url: instance.url,
      dateCreated: instance.dateCreated.toISOString(),
      dateUpdated: instance.dateUpdated.toISOString(),
    };
  }

  /**
   * Create a new WhatsApp template in Twilio
   */
  async createTemplate(payload: CreateTemplatePayload): Promise<TwilioTemplateResponse> {
    const { friendlyName, language, body, category, contentType, variables, actions } = payload;

    try {
      this.logger.log(`Creating WhatsApp Template with friendly_name: ${friendlyName}`);

      const templatePayload = {
        friendlyName,
        language,
        category,
        variables,
        types: {
          [contentType]: {
            body: body,
            ...(actions && { actions }),
          },
        },
      };

      const response = await this.twilioClient.content.v1.contents.create(templatePayload);

      this.logger.log(`WhatsApp Template created successfully with friendly_name: ${friendlyName}`);
      return this.mapContentInstanceToResponse(response);
    } catch (error: any) {
      this.logger.error(`Error creating WhatsApp Template: ${error?.message || error}`);
      throw new Error(error.message || error);
    }
  }

  /**
   * Create template and submit for approval in one step
   */
  async createAndSubmitTemplate(payload: CreateTemplatePayload & { name: string }): Promise<{
    template: TwilioTemplateResponse;
    approval: ApprovalResponse;
  }> {
    try {
      // First create the template
      const template = await this.createTemplate(payload);

      // Then submit for approval
      const approval = await this.submitTemplateForApproval({
        sid: template.sid,
        name: payload.name,
        category: payload.category,
      });

      return { template, approval };
    } catch (error: any) {
      this.logger.error(`Error creating and submitting template: ${error?.message || error}`);
      throw new Error(error.message || error);
    }
  }

  /**
   * Submit a single template for approval
   */
  async submitTemplateForApproval(payload: SubmitApprovalPayload): Promise<ApprovalResponse> {
    const { sid, name, category } = payload;

    try {
      this.logger.log(`Submitting WhatsApp Template for approval with SID: ${sid}`);
      const endpoint = `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`;

      const response = await axios.post(
        endpoint,
        { name, category, allow_category_change: false },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          auth: {
            username: this.accountSid,
            password: this.authToken,
          },
        },
      );

      this.logger.log(`WhatsApp Template submitted for approval with SID: ${sid}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Error submitting WhatsApp Template for approval with SID: ${sid}`,
        error.response ? error.response.data : error.message,
      );
      throw new Error(error.response ? error.response.data : error.message);
    }
  }

  /**
   * Submit multiple templates for approval (bulk operation)
   */
  async bulkSubmitTemplatesForApproval(
    templates: SubmitApprovalPayload[],
  ): Promise<{
    successful: ApprovalResponse[];
    failed: { template: SubmitApprovalPayload; error: string }[];
  }> {
    const successful: ApprovalResponse[] = [];
    const failed: { template: SubmitApprovalPayload; error: string }[] = [];

    for (const template of templates) {
      try {
        const result = await this.submitTemplateForApproval(template);
        successful.push(result);
      } catch (error: any) {
        failed.push({
          template,
          error: error.message,
        });
      }
    }

    this.logger.log(`Bulk submission completed: ${successful.length} successful, ${failed.length} failed`);
    return { successful, failed };
  }

  /**
   * Get all templates from Twilio
   */
  async getAllTemplates(): Promise<TwilioTemplateResponse[]> {
    try {
      this.logger.log('Fetching all templates from Twilio');

      const templates = await this.twilioClient.content.v1.contents.list();

      return templates.map(template => this.mapContentInstanceToResponse(template));
    } catch (error: any) {
      this.logger.error(`Error fetching templates from Twilio: ${error?.message || error}`);
      throw new Error(error.message || error);
    }
  }

  /**
   * Get a single template by SID from Twilio
   */
  async getTemplateBySid(sid: string): Promise<TwilioTemplateResponse> {
    try {
      const template = await this.twilioClient.content.v1.contents(sid).fetch();

      return this.mapContentInstanceToResponse(template);
    } catch (error: any) {
      this.logger.error(`Error fetching template with SID ${sid} from Twilio: ${error?.message || error}`);
      throw new Error(error.message || error);
    }
  }

  /**
   * Delete a template from Twilio
   */
  async deleteTemplate(sid: string): Promise<{ message: string }> {
    try {
      this.logger.log(`Deleting WhatsApp Template in Twilio with ID: ${sid}`);
      
      await axios.delete(`https://content.twilio.com/v1/Content/${sid}`, {
        auth: {
          username: this.accountSid,
          password: this.authToken,
        },
      });

      this.logger.log(`Successfully deleted WhatsApp Template in Twilio with ID: ${sid}`);
      return { message: 'Template deleted successfully in Twilio' };
    } catch (error: any) {
      this.logger.error(
        `Error deleting WhatsApp Template in Twilio: ${error.response ? JSON.stringify(error.response.data) : error.message}`,
      );
      throw new Error(error.response ? error.response.data : error.message);
    }
  }

  /**
   * Get approval status for a specific template
   */
  async getTemplateApprovalStatus(sid: string): Promise<ApprovalStatusResponse> {
    try {
      this.logger.log(`Fetching approval status for template SID: ${sid}`);
      
      const response = await axios.get(
        `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`,
        {
          auth: {
            username: this.accountSid,
            password: this.authToken,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const approvalRequest = response.data.whatsapp || {};
      
      this.logger.log(`Fetched approval status for template SID: ${sid} status ${approvalRequest.status}`);
      
      return {
        status: approvalRequest.status,
        rejectionReason: approvalRequest.rejection_reason || null,
      };
    } catch (error: any) {
      this.logger.error(
        `Error fetching approval status for template SID: ${sid}`,
        error?.response ? error.response?.data : error?.message,
      );
      throw new Error(error.response ? error.response.data : error.message);
    }
  }

  /**
   * Get approval requests for templates (all or specific)
   */
  async getApprovalRequests(contentSid?: string): Promise<any[]> {
    try {
      const endpoint = contentSid
        ? `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`
        : 'https://content.twilio.com/v1/Content/ApprovalRequests';

      const response = await axios.get(endpoint, {
        auth: {
          username: this.accountSid,
          password: this.authToken,
        },
      });

      return response.data.approval_requests || [];
    } catch (error: any) {
      throw new Error(error.response ? error.response.data : error.message);
    }
  }

  /**
   * Map Twilio approval status to database enum
   */
  mapTwilioStatusToEnum(twilioStatus: string): 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'UNKNOWN' {
    switch (twilioStatus?.toLowerCase()) {
      case 'approved':
        return 'APPROVED';
      case 'rejected':
        return 'REJECTED';
      case 'pending':
        return 'PENDING';
      case 'received':
        return 'RECEIVED';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Validate category enum
   */
  validateCategory(category: string): boolean {
    const validCategories = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];
    return validCategories.includes(category.toUpperCase());
  }
}
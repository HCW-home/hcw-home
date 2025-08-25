import { z } from 'zod';

// Enums as Zod schemas
export const CategorySchema = z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']);

export const ApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DRAFT',
  'UNKNOWN',
  'RECEIVED',
]);

// Create WhatsApp Template Schema
export const createWhatsappTemplateSchema = z.object({
  sid: z
    .string()
    .min(1, 'SID cannot be empty')
    .max(255, 'SID must be less than 255 characters')
    .optional(),
  
  friendlyName: z
    .string()
    .min(1, 'Friendly name is required')
    .max(255, 'Friendly name must be less than 255 characters')
    .trim(),
  
  language: z
    .string()
    .min(1, 'Language is required')
    .max(20, 'Language code must be less than 20 characters')
    .regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Invalid language code format (e.g., en_US)')
    .trim(),
  
  key: z
    .string()
    .min(1, 'Key cannot be empty')
    .max(255, 'Key must be less than 255 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Key can only contain letters, numbers, underscores, and hyphens')
    .optional(),
  
  category: CategorySchema.optional(),
  
  contentType: z
    .string()
    .min(1, 'Content type cannot be empty')
    .max(50, 'Content type must be less than 50 characters')
    .optional(),
  
  variables: z
    .record(z.any())
    .default({})
    .optional(),
  
  types: z
    .record(z.any())
    .optional(),
  
  url: z
    .string()
    .url('Invalid URL format')
    .max(500, 'URL must be less than 500 characters')
    .optional(),
  
  actions: z
    .record(z.any())
    .optional(),
  
  approvalStatus: ApprovalStatusSchema.default('DRAFT').optional(),
  
  rejectionReason: z
    .string()
    .max(1000, 'Rejection reason must be less than 1000 characters')
    .optional(),
});

// Update WhatsApp Template Schema
export const updateWhatsappTemplateSchema = z.object({
  sid: z
    .string()
    .min(1, 'SID cannot be empty')
    .max(255, 'SID must be less than 255 characters')
    .optional(),
  
  friendlyName: z
    .string()
    .min(1, 'Friendly name cannot be empty')
    .max(255, 'Friendly name must be less than 255 characters')
    .trim()
    .optional(),
  
  language: z
    .string()
    .min(1, 'Language cannot be empty')
    .max(20, 'Language code must be less than 20 characters')
    .regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Invalid language code format (e.g., en_US)')
    .trim()
    .optional(),
  
  key: z
    .string()
    .min(1, 'Key cannot be empty')
    .max(255, 'Key must be less than 255 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Key can only contain letters, numbers, underscores, and hyphens')
    .optional(),
  
  category: CategorySchema.optional(),
  
  contentType: z
    .string()
    .min(1, 'Content type cannot be empty')
    .max(50, 'Content type must be less than 50 characters')
    .optional(),
  
  variables: z
    .record(z.any())
    .optional(),
  
  types: z
    .record(z.any())
    .optional(),
  
  url: z
    .string()
    .url('Invalid URL format')
    .max(500, 'URL must be less than 500 characters')
    .or(z.literal(''))
    .optional(),
  
  actions: z
    .record(z.any())
    .optional(),
  
  approvalStatus: ApprovalStatusSchema.optional(),
  
  rejectionReason: z
    .string()
    .max(1000, 'Rejection reason must be less than 1000 characters')
    .or(z.literal(''))
    .optional(),
});

// Query WhatsApp Template Schema
export const queryWhatsappTemplateSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => val > 0, 'Page must be greater than 0')
    .or(z.number().min(1, 'Page must be greater than 0'))
    .default(1),
  
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .or(z.number().min(1).max(100, 'Limit must be between 1 and 100'))
    .default(10),
  
  search: z
    .string()
    .max(255, 'Search term must be less than 255 characters')
    .trim()
    .optional(),
  
  category: CategorySchema.optional(),
  
  approvalStatus: ApprovalStatusSchema.optional(),
  
  language: z
    .string()
    .max(20, 'Language code must be less than 20 characters')
    .regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Invalid language code format (e.g., en_US)')
    .trim()
    .optional(),
  
  sortBy: z
    .enum(['id', 'friendlyName', 'language', 'category', 'approvalStatus', 'createdAt', 'updatedAt'])
    .default('createdAt')
    .optional(),
  
  sortOrder: z
    .enum(['asc', 'desc'])
    .default('desc')
    .optional(),
});

// Type exports for better TypeScript integration
export type CreateWhatsappTemplateInput = z.infer<typeof createWhatsappTemplateSchema>;
export type UpdateWhatsappTemplateInput = z.infer<typeof updateWhatsappTemplateSchema>;
export type QueryWhatsappTemplateInput = z.infer<typeof queryWhatsappTemplateSchema>;
export type CategoryType = z.infer<typeof CategorySchema>;
export type ApprovalStatusType = z.infer<typeof ApprovalStatusSchema>;
import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name cannot exceed 100 characters')
    .trim(),
  logo: z.string().url('Logo must be a valid URL').optional().or(z.literal('')),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid hex color code')
    .optional()
    .or(z.literal('')),
  footerMarkdown: z
    .string()
    .max(5000, 'Footer markdown cannot exceed 5000 characters')
    .optional()
    .or(z.literal('')),
});

export const updateOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name cannot exceed 100 characters')
    .trim()
    .optional(),
  logo: z.string().url('Logo must be a valid URL').optional().or(z.literal('')),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid hex color code')
    .optional()
    .or(z.literal('')),
  footerMarkdown: z
    .string()
    .max(5000, 'Footer markdown cannot exceed 5000 characters')
    .optional()
    .or(z.literal('')),
});

export const queryOrganizationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().optional().transform((val) => val?.trim() || undefined),
  sortBy: z.enum(['id', 'name', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const addMemberSchema = z.object({
  userId: z.number().int().positive('User ID must be a positive integer'),
  role: z.enum(['ADMIN', 'MEMBER']).optional().default('MEMBER'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER'], {
    required_error: 'Role is required',
    invalid_type_error: 'Role must be either ADMIN or MEMBER',
  }),
});

export const queryMembersSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  search: z.string().optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  sortBy: z.enum(['id', 'joinedAt', 'role']).optional().default('joinedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type QueryOrganizationInput = z.infer<typeof queryOrganizationSchema>;

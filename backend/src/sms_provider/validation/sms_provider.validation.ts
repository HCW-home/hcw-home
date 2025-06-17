import { z } from 'zod';

export const createSmsProviderSchema = z.object({
  order: z
    .number()
    .int()
    .min(0, 'Order must be a non-negative integer')
    .optional(),
  provider: z
    .string()
    .min(1, 'Provider name must be at least 1 character')
    .max(100, 'Provider name cannot exceed 100 characters')
    .trim()
    .optional(),
  prefix: z
    .string()
    .min(1, 'Prefix must be at least 1 character')
    .max(20, 'Prefix cannot exceed 20 characters')
    .trim()
    .optional(),
  isWhatsapp: z
    .boolean()
    .optional()
    .default(false),
  isDisabled: z
    .boolean()
    .optional()
    .default(false),
});

export const updateSmsProviderSchema = z.object({
  order: z
    .number()
    .int()
    .min(0, 'Order must be a non-negative integer')
    .optional(),
  provider: z
    .string()
    .min(1, 'Provider name must be at least 1 character')
    .max(100, 'Provider name cannot exceed 100 characters')
    .trim()
    .optional(),
  prefix: z
    .string()
    .min(1, 'Prefix must be at least 1 character')
    .max(20, 'Prefix cannot exceed 20 characters')
    .trim()
    .optional(),
  isWhatsapp: z
    .boolean()
    .optional(),
  isDisabled: z
    .boolean()
    .optional(),
});

export const querySmsProviderSchema = z.object({
  page: z
    .string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 1)
    .refine(val => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 10)
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  search: z
    .string()
    .optional()
    .transform(val => val?.trim() || undefined),
  isWhatsapp: z
    .string()
    .optional()
    .transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  isDisabled: z
    .string()
    .optional()
    .transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  sortBy: z
    .enum(['id', 'order', 'provider', 'prefix', 'createdAt', 'updatedAt'])
    .optional()
    .default('order'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('asc'),
});

export type CreateSmsProviderInput = z.infer<typeof createSmsProviderSchema>;
export type UpdateSmsProviderInput = z.infer<typeof updateSmsProviderSchema>;
export type QuerySmsProviderInput = z.infer<typeof querySmsProviderSchema>;
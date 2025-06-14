import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().optional(),
  sharedOnlyIncomingConsultation: z.boolean().optional().default(false),
});

export const updateGroupSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .optional(),
  description: z.string().optional(),
  sharedOnlyIncomingConsultation: z.boolean().optional(),
});

export const queryGroupSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  sortBy: z
    .enum(['id', 'name', 'createdAt', 'updatedAt'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const addMemberToGroupSchema = z.object({
  userId: z.number().int().positive('User ID must be a positive integer'),
});

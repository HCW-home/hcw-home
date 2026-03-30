import { z } from 'zod';
import { UserRole, UserSex, UserStatus } from '@prisma/client';

export const createUserSchema = z.object({
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({
      message: 'Role must be PATIENT, PRACTITIONER, or ADMIN',
    }),
  }),
  firstName: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name cannot exceed 50 characters')
    .regex(/^[a-zA-Z\s]+$/, 'First name can only contain letters and spaces'),
  lastName: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name cannot exceed 50 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Last name can only contain letters and spaces'),
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email cannot exceed 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    ),
  temporaryAccount: z.boolean().optional().default(false),
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must start with a country code (e.g., +91...)')
    .optional(),
  country: z
    .string()
    .min(2, 'Country must be at least 2 characters')
    .max(100, 'Country cannot exceed 100 characters')
    .optional(),
  sex: z.nativeEnum(UserSex).optional(),
  status: z.nativeEnum(UserStatus).optional().default(UserStatus.NOT_APPROVED),
  organisationIds: z.array(z.number().int().positive()),
  groupIds: z.array(z.number().int().positive()).optional(),
  languageIds: z.array(z.number().int().positive()).optional(),
  specialityIds: z.array(z.number().int().positive()).optional(),
});

export const updateUserSchema = createUserSchema
  .partial()
  .omit({ password: true });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(100, 'New password cannot exceed 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    ),
});
export const updatePasswordSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

export const queryUserSchema = z.object({
  page: z.preprocess((val) => Number(val), z.number().min(1)).default(1),
  limit: z
    .preprocess((val) => Number(val), z.number().min(1).max(100))
    .default(10),
  search: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  sex: z.nativeEnum(UserSex).optional(),
  sortBy: z
    .enum(['firstName', 'lastName', 'email', 'createdAt'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

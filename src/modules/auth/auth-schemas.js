import { z } from 'zod'

export const loginBodySchema = z.strictObject({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(1)
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes'),
})

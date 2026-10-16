import { z } from 'zod'

import { contactInquiryStatuses } from '../contact-inquiry-values.js'
import { normalizeContactMessage } from '../contact-normalization.js'

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID')

export const adminContactEmptyQuerySchema = z.strictObject({})

export const adminContactIdParamsSchema = z.strictObject({ id: objectIdSchema })

export const adminContactListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(contactInquiryStatuses).optional(),
})

export const updateAdminContactStatusBodySchema = z.strictObject({
  action: z.enum(['read', 'archive', 'restore']),
})

const unsafeCharactersPattern = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u

export const createAdminContactReplyBodySchema = z.strictObject({
  message: z
    .string()
    .transform(normalizeContactMessage)
    .pipe(
      z
        .string()
        .min(1)
        .max(5_000)
        .refine((value) => !unsafeCharactersPattern.test(value), 'Reply contains unsupported characters'),
    ),
})

export const createAdminContactReplyHeadersSchema = z
  .object({
    'idempotency-key': z.string().uuid(),
  })
  .transform((headers) => ({ idempotencyKey: headers['idempotency-key'] }))

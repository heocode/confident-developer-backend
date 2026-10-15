import { z } from 'zod'

import { referenceRejectionReasons, referenceStatuses } from '../reference.js'

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID')
const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}

const unsafeCharactersPattern = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u

export const adminReferenceEmptyQuerySchema = z.strictObject({})

export const updateReferenceSettingsBodySchema = z.strictObject({
  emptyStateMessage: z
    .string()
    .transform((value) => value.normalize('NFC').replace(/\r\n?/gu, '\n').trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(300)
        .refine((value) => !unsafeCharactersPattern.test(value), 'Text contains unsupported characters'),
    ),
})

export const adminReferenceIdParamsSchema = z.strictObject({ id: objectIdSchema })

export const adminReferenceListQuerySchema = z.strictObject({
  ...paginationFields,
  status: z.enum(referenceStatuses).optional(),
})

export const updateAdminReferenceBodySchema = z
  .strictObject({
    testimonial: z.string().trim().min(20).max(1_500).optional(),
    displayOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Request body must contain at least one field')

const approveActionSchema = z.strictObject({ action: z.literal('approve') })
const reopenActionSchema = z.strictObject({ action: z.literal('reopen') })
const rejectActionSchema = z
  .strictObject({
    action: z.literal('reject'),
    reason: z.enum(referenceRejectionReasons),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((body, context) => {
    if (body.reason === 'other' && !body.note) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Moderation note is required when rejection reason is other',
      })
    }
  })

export const moderateAdminReferenceBodySchema = z.discriminatedUnion('action', [
  approveActionSchema,
  rejectActionSchema,
  reopenActionSchema,
])

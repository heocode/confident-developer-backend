import { z } from 'zod'

import { contactInquiryStatuses } from '../contact-inquiry-values.js'

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

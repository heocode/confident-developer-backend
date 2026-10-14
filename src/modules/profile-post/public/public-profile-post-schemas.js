import { z } from 'zod'

export const profilePostRevisionSchema = z.number().int().min(1)

export const profilePostInteractionQuerySchema = z.strictObject({
  revision: z.coerce.number().int().min(1),
})

export const profilePostInteractionBodySchema = z.strictObject({
  revision: profilePostRevisionSchema,
})

export const emptyProfilePostQuerySchema = z.strictObject({})

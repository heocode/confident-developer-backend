import { z } from 'zod'

export const publicServiceListQuerySchema = z.strictObject({
  placement: z.literal('home').optional(),
})

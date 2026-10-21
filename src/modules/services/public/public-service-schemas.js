import { z } from 'zod'

export const publicServiceListQuerySchema = z.strictObject({
  placement: z.literal('home').optional(),
})

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens')

export const publicServiceSlugParamsSchema = z.strictObject({ slug: slugSchema })

export const publicServiceDetailQuerySchema = z.strictObject({})

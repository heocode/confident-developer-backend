import { z } from 'zod'

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens')

export const publicProjectListQuerySchema = z.strictObject({
  placement: z.literal('home').optional(),
})

export const publicProjectSlugParamsSchema = z.strictObject({
  slug: slugSchema,
})

export const publicProjectDetailQuerySchema = z.strictObject({})

import { z } from 'zod'

import { serviceIcons, serviceStatuses, serviceTones } from '../portfolio-service.js'

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID')
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens')
const integer = z.number().int().min(0).max(999)
const homeSchema = z
  .strictObject({
    featured: z.boolean().optional(),
    order: integer.optional(),
  })
  .refine((home) => Object.keys(home).length > 0, 'Home placement update cannot be empty')

function writableServiceFields() {
  return {
    description: z.string().trim().max(1_500).nullable().optional(),
    icon: z.enum(serviceIcons).nullable().optional(),
    tone: z.enum(serviceTones).nullable().optional(),
    status: z.enum(serviceStatuses).optional(),
    home: homeSchema.optional(),
    servicesPageOrder: integer.optional(),
  }
}

export const createAdminServiceBodySchema = z.strictObject({
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  ...writableServiceFields(),
})

export const updateAdminServiceBodySchema = z
  .strictObject({
    slug: slugSchema.optional(),
    title: z.string().trim().min(1).max(160).optional(),
    ...writableServiceFields(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Request body must contain at least one field')

export const adminServiceIdParamsSchema = z.strictObject({ id: objectIdSchema })

export const adminServiceListQuerySchema = z.strictObject({
  status: z.enum(serviceStatuses).optional(),
})

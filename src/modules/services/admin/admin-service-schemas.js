import { z } from 'zod'

import {
  serviceIcons,
  serviceStatuses,
  serviceTones,
  serviceToolKeys,
} from '../portfolio-service.js'

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
const capabilitySchema = z.string().trim().min(1).max(80)
const toolSchema = z.strictObject({
  key: z.enum(serviceToolKeys),
  label: z.string().trim().min(1).max(80),
})

function uniqueArray(schema, selector, message) {
  return schema.refine((items) => new Set(items.map(selector)).size === items.length, message)
}

const capabilitiesSchema = uniqueArray(
  z.array(capabilitySchema).max(8),
  (value) => value.toLocaleLowerCase('en-US'),
  'Capabilities cannot contain duplicate values',
)
const toolsSchema = uniqueArray(
  z.array(toolSchema).max(6),
  (tool) => tool.key,
  'Tools cannot contain duplicate keys',
)
const relatedProjectsSchema = uniqueArray(
  z.array(objectIdSchema).max(3),
  (id) => id.toLowerCase(),
  'Related projects cannot contain duplicate IDs',
)
const showcaseAssetsSchema = uniqueArray(
  z.array(objectIdSchema).max(5),
  (id) => id.toLowerCase(),
  'Showcase cannot contain duplicate media IDs',
)

function writableServiceFields() {
  return {
    description: z.string().trim().max(1_500).nullable().optional(),
    icon: z.enum(serviceIcons).nullable().optional(),
    tone: z.enum(serviceTones).nullable().optional(),
    capabilities: capabilitiesSchema.optional(),
    tools: toolsSchema.optional(),
    relatedProjects: relatedProjectsSchema.optional(),
    showcaseAssets: showcaseAssetsSchema.optional(),
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

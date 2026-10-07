import { z } from 'zod'

import { projectLinkIcons, projectStatuses } from '../models/portfolio-project.js'

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID')
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens')
const optionalText = (maximum) => z.string().trim().max(maximum).nullable().optional()
const integer = (minimum = 0, maximum = 999) => z.number().int().min(minimum).max(maximum)

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid ISO date')
  .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value), 'Must be a valid ISO date')
const timestampSchema = z.string().datetime({ offset: true })
const dateSchema = z
  .union([calendarDateSchema, timestampSchema])
  .transform((value) => new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value))

const timelineSchema = z
  .strictObject({
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
  })
  .refine((timeline) => Object.keys(timeline).length > 0, 'Timeline update cannot be empty')

const homeSchema = z
  .strictObject({
    featured: z.boolean().optional(),
    primary: z.boolean().optional(),
    order: integer().optional(),
  })
  .refine((home) => !(home.featured === false && home.primary === true), {
    message: 'Primary projects must also be featured',
    path: ['primary'],
  })
  .refine((home) => Object.keys(home).length > 0, 'Home placement update cannot be empty')

function buildBreakdownSchema({ allowId }) {
  return z.strictObject({
    ...(allowId ? { id: objectIdSchema.optional() } : {}),
    label: z.string().trim().min(1).max(120),
    percentage: integer(0, 100),
  })
}

function projectLinkSchema({ allowId }) {
  return z.strictObject({
    ...(allowId ? { id: objectIdSchema.optional() } : {}),
    icon: z.enum(projectLinkIcons),
    label: z.string().trim().min(1).max(80),
    url: z
      .string()
      .trim()
      .url()
      .max(2_048)
      .refine((value) => new URL(value).protocol === 'https:', 'Project link must use HTTPS'),
  })
}

function screenshotSchema({ allowId }) {
  return z.strictObject({
    ...(allowId ? { id: objectIdSchema.optional() } : {}),
    asset: objectIdSchema,
    alt: z.string().trim().min(1).max(300),
  })
}

function writableProjectFields({ allowNestedIds }) {
  return {
    tagline: optionalText(240),
    summary: optionalText(1_500),
    scope: optionalText(5_000),
    position: optionalText(160),
    themeColor: z.string().trim().regex(/^#[0-9a-f]{6}$/i, 'Theme color must use #RRGGBB format').nullable().optional(),
    status: z.enum(projectStatuses).optional(),
    timeline: timelineSchema.nullable().optional(),
    home: homeSchema.optional(),
    projectsPageOrder: integer().optional(),
    buildBreakdown: z.array(buildBreakdownSchema({ allowId: allowNestedIds })).max(12).optional(),
    links: z.array(projectLinkSchema({ allowId: allowNestedIds })).max(10).optional(),
    logoAsset: objectIdSchema.nullable().optional(),
    homePreviewAsset: objectIdSchema.nullable().optional(),
    screenshots: z.array(screenshotSchema({ allowId: allowNestedIds })).max(12).optional(),
  }
}

export const createAdminProjectBodySchema = z.strictObject({
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  ...writableProjectFields({ allowNestedIds: false }),
})

export const updateAdminProjectBodySchema = z
  .strictObject({
    slug: slugSchema.optional(),
    title: z.string().trim().min(1).max(160).optional(),
    ...writableProjectFields({ allowNestedIds: true }),
  })
  .refine((body) => Object.keys(body).length > 0, 'Request body must contain at least one field')

export const adminProjectIdParamsSchema = z.strictObject({ id: objectIdSchema })

export const adminProjectListQuerySchema = z.strictObject({
  status: z.enum(projectStatuses).optional(),
})

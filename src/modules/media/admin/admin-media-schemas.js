import { z } from 'zod'

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID')
const altSchema = z.string().trim().min(1).max(300)
const mediaKindSchema = z.enum(['image', 'video', 'animation', 'document'])

export const createMediaUploadSignatureBodySchema = z.preprocess(
  (body) => body ?? {},
  z.strictObject({ kind: z.enum(['image', 'video', 'animation']).default('image') }),
)

export const registerAdminMediaBodySchema = z.strictObject({
  provider: z.enum(['cloudinary']),
  providerAssetId: z.string().trim().min(1).max(255),
  kind: z.enum(['image', 'video', 'animation']).default('image'),
  previewAsset: objectIdSchema.optional(),
  alt: altSchema,
})

export const adminMediaListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  status: z.enum(['active', 'pendingDeletion']).optional(),
  kind: mediaKindSchema.optional(),
})

export const adminMediaIdParamsSchema = z.strictObject({ id: objectIdSchema })

export const updateAdminMediaBodySchema = z
  .strictObject({ alt: altSchema.optional(), previewAsset: objectIdSchema.optional() })
  .refine((body) => body.alt !== undefined || body.previewAsset !== undefined, {
    message: 'At least one field is required',
  })

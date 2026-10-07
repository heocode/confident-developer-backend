import { z } from 'zod'

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID')
const altSchema = z.string().trim().min(1).max(300)

export const createMediaUploadSignatureBodySchema = z.preprocess(
  (body) => body ?? {},
  z.strictObject({}),
)

export const registerAdminMediaBodySchema = z.strictObject({
  provider: z.enum(['cloudinary']),
  providerAssetId: z.string().trim().min(1).max(255),
  alt: altSchema,
})

export const adminMediaListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  status: z.enum(['active', 'pendingDeletion']).optional(),
})

export const adminMediaIdParamsSchema = z.strictObject({ id: objectIdSchema })

export const updateAdminMediaBodySchema = z.strictObject({ alt: altSchema })

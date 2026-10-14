import { z } from 'zod'

export const emptyAdminProfileBodySchema = z.preprocess((body) => body ?? {}, z.strictObject({}))
export const emptyAdminProfileQuerySchema = z.strictObject({})

export const replaceResumeBodySchema = z.strictObject({
  provider: z.enum(['cloudinary']),
  providerAssetId: z.string().trim().min(1).max(255),
})

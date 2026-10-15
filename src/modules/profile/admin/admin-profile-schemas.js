import { z } from 'zod'

const unsafeCharactersPattern = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u

export const emptyAdminProfileBodySchema = z.preprocess((body) => body ?? {}, z.strictObject({}))
export const emptyAdminProfileQuerySchema = z.strictObject({})

export const updatePublicIdentityBodySchema = z.strictObject({
  displayName: z
    .string()
    .transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
    .pipe(
      z
        .string()
        .min(2)
        .max(80)
        .refine((value) => !unsafeCharactersPattern.test(value), 'Display name contains unsupported characters'),
    ),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z\d](?:[a-z\d._-]{0,38}[a-z\d])?$/, 'Invalid public profile handle'),
  avatarAssetId: z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid media asset ID'),
})

export const replaceResumeBodySchema = z.strictObject({
  provider: z.enum(['cloudinary']),
  providerAssetId: z.string().trim().min(1).max(255),
})

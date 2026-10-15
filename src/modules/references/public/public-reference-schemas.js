import { z } from 'zod'

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID')
const unsafeCharactersPattern = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u
const urlPattern = /(?:https?:\/\/|www\.|\b(?:[a-z\d-]+\.)+[a-z]{2,63}(?:\/\S*)?\b)/iu

function normalizeSingleLine(value) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

function normalizeTestimonial(value) {
  return value.normalize('NFC').replace(/\r\n?/gu, '\n').trim()
}

function normalizedTextSchema({ min, max, multiline = false }) {
  const normalize = multiline ? normalizeTestimonial : normalizeSingleLine

  return z
    .string()
    .transform(normalize)
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .refine((value) => !unsafeCharactersPattern.test(value), 'Text contains unsupported characters'),
    )
}

export const publicReferenceListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export const publicReferenceEmptyQuerySchema = z.strictObject({})

export const publicReferenceSubmissionParamsSchema = z.strictObject({ id: objectIdSchema })

export const submitPublicReferenceBodySchema = z.strictObject({
  name: normalizedTextSchema({ min: 2, max: 80 }),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  company: normalizedTextSchema({ min: 2, max: 120 }),
  position: normalizedTextSchema({ min: 2, max: 120 }),
  testimonial: normalizedTextSchema({ min: 20, max: 1_500, multiline: true }).refine(
    (value) => !urlPattern.test(value),
    'Testimonial must not contain links',
  ),
  ratings: z.strictObject({
    overall: z.number().int().min(1).max(5),
    technical: z.number().int().min(1).max(5),
    communication: z.number().int().min(1).max(5),
  }),
  turnstileToken: z.string().trim().min(1).max(2_048),
  website: z.string().max(0, 'Submission could not be accepted').default(''),
})

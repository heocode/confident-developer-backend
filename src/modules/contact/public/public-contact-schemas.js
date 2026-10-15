import { z } from 'zod'

import {
  normalizeContactEmail,
  normalizeContactMessage,
  normalizeContactName,
} from '../contact-normalization.js'
import { contactInquiryBudgets, contactInquiryScopes } from '../contact-inquiry-values.js'

const unsafeCharactersPattern = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u

function normalizedTextSchema({ min, max, normalize }) {
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

export const publicContactEmptyQuerySchema = z.strictObject({})

export const submitPublicContactBodySchema = z.strictObject({
  name: normalizedTextSchema({ min: 2, max: 80, normalize: normalizeContactName }),
  email: z
    .string()
    .transform(normalizeContactEmail)
    .pipe(z.string().email().max(254)),
  message: normalizedTextSchema({ min: 20, max: 5_000, normalize: normalizeContactMessage }),
  scopes: z
    .array(z.enum(contactInquiryScopes))
    .min(1)
    .max(contactInquiryScopes.length)
    .refine((values) => new Set(values).size === values.length, 'Scopes must not contain duplicates'),
  budget: z.enum(contactInquiryBudgets),
  turnstileToken: z.string().trim().min(1).max(2_048),
  website: z.string().max(0, 'Submission could not be accepted').default(''),
})

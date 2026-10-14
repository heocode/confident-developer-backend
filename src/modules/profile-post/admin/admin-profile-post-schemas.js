import { z } from 'zod'

import { PROFILE_POST_TEXT_MAX_LENGTH } from '../profile-post.js'

export const replaceProfilePostBodySchema = z.strictObject({
  text: z.string().trim().min(1).max(PROFILE_POST_TEXT_MAX_LENGTH),
})

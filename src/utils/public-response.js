const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
const PUBLIC_CDN_CACHE_CONTROL = 'max-age=60, stale-while-revalidate=300'

export function sendCacheablePublicJson(
  response,
  body,
  { cacheControl = PUBLIC_CACHE_CONTROL, cdnCacheControl = PUBLIC_CDN_CACHE_CONTROL } = {},
) {
  response
    .set('Cache-Control', cacheControl)
    .set('CDN-Cache-Control', cdnCacheControl)
    .json(body)
}

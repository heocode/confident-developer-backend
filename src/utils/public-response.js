const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
const PUBLIC_CDN_CACHE_CONTROL = 'max-age=60, stale-while-revalidate=300'

export function sendCacheablePublicJson(response, body) {
  response
    .set('Cache-Control', PUBLIC_CACHE_CONTROL)
    .set('CDN-Cache-Control', PUBLIC_CDN_CACHE_CONTROL)
    .json(body)
}

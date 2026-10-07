export function noStore(_request, response, next) {
  response.set('Cache-Control', 'private, no-store')
  next()
}

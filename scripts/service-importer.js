import {
  createAdminServiceBodySchema,
  updateAdminServiceBodySchema,
} from '../src/modules/services/admin/admin-service-schemas.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function buildServiceImportPlan(manifest) {
  assert(manifest?.version === 1, 'Unsupported service import manifest version')
  assert(Array.isArray(manifest.services) && manifest.services.length > 0, 'Import manifest services are required')

  const slugs = new Set()
  const homeOrders = new Set()
  const servicesPageOrders = new Set()
  const services = manifest.services.map((service) => {
    const content = createAdminServiceBodySchema.parse(service)
    assert(content.status === 'draft', `Imported service must begin as a draft: ${content.slug}`)
    assert(!slugs.has(content.slug), `Duplicate service slug: ${content.slug}`)
    assert(!homeOrders.has(content.home.order), `Duplicate Home order: ${content.home.order}`)
    assert(
      !servicesPageOrders.has(content.servicesPageOrder),
      `Duplicate Services page order: ${content.servicesPageOrder}`,
    )

    slugs.add(content.slug)
    homeOrders.add(content.home.order)
    servicesPageOrders.add(content.servicesPageOrder)
    return content
  })

  assert(services.filter(({ home }) => home.featured).length <= 4, 'Home cannot contain more than 4 services')
  return { version: manifest.version, services }
}

export function buildServicePayload(service, existingService = null) {
  const payload = { ...structuredClone(service), status: 'draft' }
  return existingService
    ? updateAdminServiceBodySchema.parse(payload)
    : createAdminServiceBodySchema.parse(payload)
}

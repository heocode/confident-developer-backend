import 'dotenv/config'

import { serviceImportManifest } from './service-import-manifest.js'
import { buildServiceImportPlan, buildServicePayload } from './service-importer.js'
import {
  ImportApiError,
  createImportApiClient,
  parseImportArguments,
} from './utils/import-api-client.js'
import {
  confirm,
  readAdminCredentials,
  requireInteractiveTerminal,
} from './utils/import-prompts.js'

function printLocalPlan(plan, options) {
  console.log('Service import plan')
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'interactive apply'}`)
  console.log(`API: ${options.baseUrl}`)
  console.log(`Trusted origin: ${options.origin}`)
  console.log(`Services: ${plan.services.length}`)

  for (const service of plan.services) {
    console.log(
      `  ${service.slug}: Home order ${service.home.order}, Services order ${service.servicesPageOrder}`,
    )
  }
}

function describeRemoteActions(plan, existingServices) {
  const servicesBySlug = new Map(existingServices.map((service) => [service.slug, service]))
  console.log('Remote service actions:')

  for (const service of plan.services) {
    const existing = servicesBySlug.get(service.slug)
    const transition = existing?.status === 'published' ? ' and temporarily return it to draft' : ''
    console.log(`  ${existing ? 'Update' : 'Create'} ${service.slug}${transition}`)
  }

  console.log('  Publication requires a separate confirmation after every draft is ready')
  return servicesBySlug
}

async function prepareDrafts({ api, plan, servicesBySlug }) {
  const drafts = []

  for (const service of plan.services) {
    const existing = servicesBySlug.get(service.slug) ?? null
    const payload = buildServicePayload(service, existing)
    const draft = existing
      ? await api.updateService(existing.id, payload)
      : await api.createService(payload)
    drafts.push(draft)
    console.log(`Prepared draft: ${service.slug}`)
  }

  return drafts
}

async function run() {
  const options = parseImportArguments(process.argv.slice(2))
  const plan = buildServiceImportPlan(serviceImportManifest)
  printLocalPlan(plan, options)

  if (options.dryRun) {
    console.log('Dry-run complete. No network requests or external changes were made.')
    return
  }

  requireInteractiveTerminal('Service import')
  if (!(await confirm('Connect to the Admin API? Login will rotate any existing administrator session.'))) {
    console.log('Import cancelled before login. No external changes were made.')
    return
  }

  const credentials = await readAdminCredentials()
  const api = createImportApiClient(options)

  try {
    const admin = await api.login(credentials)
    credentials.password = undefined
    console.log(`Authenticated as ${admin.displayName}.`)

    const existingServices = await api.listServices()
    const servicesBySlug = describeRemoteActions(plan, existingServices)
    if (!(await confirm('Apply the draft service changes?'))) {
      console.log('Import cancelled before content changes.')
      return
    }

    const drafts = await prepareDrafts({ api, plan, servicesBySlug })
    if (!(await confirm('Publish all four prepared services now?'))) {
      console.log('Services remain as drafts. Rerun the importer to resume publication.')
      return
    }

    for (const service of drafts) {
      await api.updateService(service.id, { status: 'published' })
      console.log(`Published service: ${service.slug}`)
    }

    console.log('Service import completed successfully.')
  } finally {
    credentials.password = undefined
    await api.logout().catch(() => console.error('Warning: unable to close the importer session.'))
  }
}

run().catch((error) => {
  const prefix = error instanceof ImportApiError ? `API request failed (${error.status})` : 'Service import failed'
  console.error(`${prefix}: ${error.message}`)
  process.exitCode = 1
})

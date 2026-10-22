import 'dotenv/config'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serviceImportManifest } from './service-import-manifest.js'
import {
  applyServiceDrafts,
  buildServiceImportPlan,
  createServiceImportContext,
  isServiceImportPlanPublishable,
  loadServiceImportState,
  publishServiceDrafts,
  saveServiceImportState,
  uploadServiceMediaPlan,
  validateServiceProjectLogos,
  verifyPublicServiceImport,
} from './service-importer.js'
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

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const statePath = resolve(workspaceRoot, 'output/service-import-state.json')

function printLocalPlan(plan, options) {
  const showcaseCount = plan.services.reduce((total, service) => total + service.showcase.length, 0)
  const previewCount = plan.assets.filter(({ role }) => role === 'preview').length

  console.log('Service import plan')
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'interactive apply'}`)
  console.log(`API: ${options.baseUrl}`)
  console.log(`Trusted origin: ${options.origin}`)
  console.log(`Services: ${plan.services.length}`)
  console.log(`Showcase assets: ${showcaseCount}`)
  console.log(`Preview assets: ${previewCount}`)

  for (const service of plan.services) {
    console.log(
      `  ${service.content.slug}: ${service.showcase.length} showcase, ` +
        `${service.relatedProjectSlugs.length} related projects`,
    )
  }
}

function describeRemoteActions(plan, context) {
  console.log('Remote service actions:')
  for (const service of plan.services) {
    const existing = context.servicesBySlug.get(service.content.slug)
    const transition =
      existing?.status === 'published' ? '; changed content will temporarily return to draft' : ''
    console.log(
      `  ${existing ? 'Update or reuse' : 'Create'} ${service.content.slug}${transition}`,
    )
  }
  console.log('  Upload or resume all missing media assets')
  console.log('  Publication requires a separate confirmation after every draft is ready')
}

async function run() {
  const options = parseImportArguments(process.argv.slice(2))
  const plan = await buildServiceImportPlan(serviceImportManifest, { workspaceRoot })
  printLocalPlan(plan, options)

  if (options.dryRun) {
    console.log('Dry-run complete. No network requests or external changes were made.')
    return
  }

  if (!isServiceImportPlanPublishable(plan)) {
    throw new Error('Service import plan is not ready for publication')
  }

  requireInteractiveTerminal('Service import')
  const state = await loadServiceImportState(statePath, plan.version)
  if (state.completedAt) console.log(`The previous service import completed at ${state.completedAt}.`)
  else if (state.mediaCompletedAt) {
    console.log(`The previous media stage completed at ${state.mediaCompletedAt}.`)
  }

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

    const [existingProjects, existingServices] = await Promise.all([
      api.listProjects(),
      api.listServices(),
    ])
    const context = createServiceImportContext(plan, existingProjects, existingServices)
    await validateServiceProjectLogos({ api, context })
    describeRemoteActions(plan, context)

    if (
      !(await confirm(
        `Upload missing media and prepare all ${plan.services.length} services as complete drafts?`,
      ))
    ) {
      console.log('Import cancelled before content changes.')
      return
    }

    state.completedAt = null
    await saveServiceImportState(statePath, state)
    const mediaAssetIds = await uploadServiceMediaPlan({
      api,
      plan,
      state,
      statePath,
      saveState: saveServiceImportState,
      onProgress: ({ asset, action }) => {
        console.log(`${action === 'reused' ? 'Reused' : 'Registered'} media: ${asset.key}`)
      },
    })

    const preparedServices = await applyServiceDrafts({
      api,
      plan,
      mediaAssetIds,
      context,
      state,
      statePath,
      onProgress: ({ service, action }) => {
        const labels = { created: 'Created draft', updated: 'Prepared draft', reused: 'Reused' }
        console.log(`${labels[action]} service: ${service.slug} (${service.status})`)
      },
    })

    const drafts = preparedServices.filter(({ status }) => status !== 'published').length
    console.log(`Prepared ${preparedServices.length} services; ${drafts} require publication.`)
    if (!(await confirm(`Publish all ${preparedServices.length} prepared services now?`))) {
      console.log('Prepared services remain as drafts. Rerun the importer to resume publication.')
      return
    }

    await publishServiceDrafts({
      api,
      services: preparedServices,
      state,
      statePath,
      onProgress: ({ service, action }) => {
        console.log(`${action === 'reused' ? 'Already published' : 'Published'} service: ${service.slug}`)
      },
    })
    await verifyPublicServiceImport({ api, plan, mediaAssetIds })
    state.completedAt = new Date().toISOString()
    await saveServiceImportState(statePath, state)
    console.log('Service import completed and the public API was verified successfully.')
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

import 'dotenv/config'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serviceImportManifest } from './service-import-manifest.js'
import {
  buildServiceImportPlan,
  isServiceImportPlanPublishable,
  loadServiceImportState,
  saveServiceImportState,
  uploadServiceMediaPlan,
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

  requireInteractiveTerminal('Service media import')
  const state = await loadServiceImportState(statePath, plan.version)
  if (state.completedAt) console.log(`The previous media import completed at ${state.completedAt}.`)

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
    console.log('This stage uploads or resumes media only. Services and projects will not be changed.')

    if (!(await confirm('Upload and register all missing service media now?'))) {
      console.log('Import cancelled before media changes.')
      return
    }

    await uploadServiceMediaPlan({
      api,
      plan,
      state,
      statePath,
      saveState: saveServiceImportState,
      onProgress: ({ asset, action }) => {
        console.log(`${action === 'reused' ? 'Reused' : 'Registered'} media: ${asset.key}`)
      },
    })
    console.log('Service media import completed. No service documents were changed.')
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

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serviceImportManifest } from './service-import-manifest.js'
import { buildServiceImportPlan, isServiceImportPlanPublishable } from './service-importer.js'
import { parseImportArguments } from './utils/import-api-client.js'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

  throw new Error(
    'Interactive apply remains disabled until iteration 4.3 adds resumable media uploads.',
  )
}

run().catch((error) => {
  console.error(`Service import failed: ${error.message}`)
  process.exitCode = 1
})

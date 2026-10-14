import 'dotenv/config'

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { projectImportManifest } from './project-import-manifest.js'
import {
  ImportApiError,
  buildImportPlan,
  buildProjectPayload,
  createImportApiClient,
  loadImportState,
  parseImportArguments,
  saveImportState,
} from './project-importer.js'
import {
  confirm,
  readAdminCredentials,
  requireInteractiveTerminal,
} from './utils/import-prompts.js'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const statePath = resolve(workspaceRoot, 'output/project-import-state.json')

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function printLocalPlan(plan, options) {
  console.log('Project import plan')
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'interactive apply'}`)
  console.log(`API: ${options.baseUrl}`)
  console.log(`Trusted origin: ${options.origin}`)
  console.log(`Assets: ${plan.assets.length}`)

  for (const asset of plan.assets) {
    console.log(`  ${asset.key}: ${asset.path} (${asset.width}x${asset.height}, ${formatBytes(asset.bytes)})`)
  }

  console.log(`Projects: ${plan.projects.length}`)
  for (const project of plan.projects) {
    console.log(
      `  ${project.content.slug}: Home order ${project.content.home.order}, Projects order ${project.content.projectsPageOrder}, screenshots ${project.media.screenshots.length}`,
    )
  }
}

function rememberSupersededAsset(state, entry) {
  if (entry?.mediaAssetId && !state.orphanedMediaAssetIds.includes(entry.mediaAssetId)) {
    state.orphanedMediaAssetIds.push(entry.mediaAssetId)
  }
  if (entry?.providerAssetId && !state.orphanedProviderAssetIds.includes(entry.providerAssetId)) {
    state.orphanedProviderAssetIds.push(entry.providerAssetId)
  }
}

async function ensureMediaAsset({ api, asset, state }) {
  let entry = state.assets[asset.key]

  if (entry && entry.sha256 !== asset.sha256) {
    rememberSupersededAsset(state, entry)
    entry = undefined
  }

  entry ??= { sha256: asset.sha256 }
  state.assets[asset.key] = entry

  if (entry.mediaAssetId) {
    const existing = await api.getMediaAsset(entry.mediaAssetId)
    if (existing) {
      if (existing.alt !== asset.alt) {
        await api.updateMediaAsset(entry.mediaAssetId, { alt: asset.alt })
      }
      entry.alt = asset.alt
      await saveImportState(statePath, state)
      console.log(`Reused media: ${asset.key}`)
      return entry.mediaAssetId
    }

    delete entry.mediaAssetId
  }

  if (!entry.providerAssetId) {
    const descriptor = await api.createUploadDescriptor()
    const uploaded = await api.uploadToProvider(descriptor, asset)
    entry.provider = uploaded.provider
    entry.providerAssetId = uploaded.providerAssetId
    entry.alt = asset.alt
    await saveImportState(statePath, state)
    console.log(`Uploaded media: ${asset.key}`)
  }

  const registered = await api.registerMediaAsset({
    provider: entry.provider,
    providerAssetId: entry.providerAssetId,
    alt: asset.alt,
  })
  entry.mediaAssetId = registered.id
  entry.alt = asset.alt
  await saveImportState(statePath, state)
  console.log(`Registered media: ${asset.key}`)
  return entry.mediaAssetId
}

function describeRemoteActions(plan, existingProjects) {
  const projectsBySlug = new Map(existingProjects.map((project) => [project.slug, project]))
  console.log('Remote project actions:')

  for (const project of plan.projects) {
    const existing = projectsBySlug.get(project.content.slug)
    const transition = existing?.status === 'published' ? ' and temporarily return it to draft' : ''
    console.log(`  ${existing ? 'Update' : 'Create'} ${project.content.slug}${transition}`)
  }

  console.log('  Upload or resume all missing media assets')
  console.log('  Publication requires a separate confirmation after every draft is ready')
  return projectsBySlug
}

async function applyProjects({ api, plan, mediaAssetIds, projectsBySlug, state }) {
  const preparedProjects = []

  for (const project of plan.projects) {
    const existing = projectsBySlug.get(project.content.slug) ?? null
    const payload = buildProjectPayload(project, mediaAssetIds, existing)
    const prepared = existing
      ? await api.updateProject(existing.id, payload)
      : await api.createProject(payload)

    state.projects[project.content.slug] = { projectId: prepared.id, status: prepared.status }
    await saveImportState(statePath, state)
    preparedProjects.push(prepared)
    console.log(`Prepared draft: ${project.content.slug}`)
  }

  return preparedProjects
}

async function publishProjects({ api, projects, state }) {
  const orderedProjects = [...projects].sort(
    (left, right) => Number(left.home.primary) - Number(right.home.primary),
  )

  for (const project of orderedProjects) {
    const published = await api.updateProject(project.id, { status: 'published' })
    state.projects[project.slug] = { projectId: published.id, status: published.status }
    await saveImportState(statePath, state)
    console.log(`Published project: ${project.slug}`)
  }

  state.completedAt = new Date().toISOString()
  await saveImportState(statePath, state)
}

async function run() {
  const options = parseImportArguments(process.argv.slice(2))
  const plan = await buildImportPlan(projectImportManifest, { workspaceRoot })
  printLocalPlan(plan, options)

  if (options.dryRun) {
    console.log('Dry-run complete. No network requests or external changes were made.')
    return
  }

  requireInteractiveTerminal('Project import')
  const state = await loadImportState(statePath)
  state.orphanedMediaAssetIds ??= []
  state.orphanedProviderAssetIds ??= []

  if (state.completedAt) console.log(`The previous import completed at ${state.completedAt}.`)

  const shouldLogin = await confirm(
    'Connect to the Admin API? Login will rotate any existing administrator session.',
  )
  if (!shouldLogin) {
    console.log('Import cancelled before login. No external changes were made.')
    return
  }

  const credentials = await readAdminCredentials()
  const api = createImportApiClient(options)

  try {
    const admin = await api.login(credentials)
    credentials.password = undefined
    console.log(`Authenticated as ${admin.displayName}.`)

    const existingProjects = await api.listProjects()
    const projectsBySlug = describeRemoteActions(plan, existingProjects)
    if (!(await confirm('Apply the media uploads and draft project updates?'))) {
      console.log('Import cancelled before content changes.')
      return
    }

    state.completedAt = null
    await saveImportState(statePath, state)

    const mediaAssetIds = {}
    for (const asset of plan.assets) {
      mediaAssetIds[asset.key] = await ensureMediaAsset({ api, asset, state })
    }

    const preparedProjects = await applyProjects({
      api,
      plan,
      mediaAssetIds,
      projectsBySlug,
      state,
    })

    if (!(await confirm('Publish all three prepared projects now?'))) {
      console.log('Projects remain as drafts. Rerun the importer to resume publication.')
      return
    }

    await publishProjects({ api, projects: preparedProjects, state })
    console.log('Project import completed successfully.')
  } finally {
    credentials.password = undefined
    await api.logout().catch(() => console.error('Warning: unable to close the importer session.'))
  }
}

run().catch((error) => {
  const prefix = error instanceof ImportApiError ? `API request failed (${error.status})` : 'Project import failed'
  console.error(`${prefix}: ${error.message}`)
  process.exitCode = 1
})

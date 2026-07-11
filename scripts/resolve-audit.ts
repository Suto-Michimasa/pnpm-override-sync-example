import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  applyOverrides,
  parseOverrides,
} from './utils/override-pnpm-workspace.ts'
import { collectNeeded } from './utils/override-versions.ts'
import {
  applyReleaseAgeExclude,
  parseReleaseAgeExclude,
} from './utils/release-age-exclude.ts'
import {
  parseReleaseAgeFailedPackage,
  retryWithReleaseAge,
} from './utils/retry-with-release-age.ts'

const WORKSPACE_PATH = 'pnpm-workspace.yaml'

function updateOverrides(overrides: Record<string, string>): void {
  const content = readFileSync(WORKSPACE_PATH, 'utf8')
  writeFileSync(WORKSPACE_PATH, applyOverrides(content, overrides))
}

function updateReleaseAgeExclude(packages: string[]): void {
  const content = readFileSync(WORKSPACE_PATH, 'utf8')
  writeFileSync(WORKSPACE_PATH, applyReleaseAgeExclude(content, packages))
}

interface AuditAdvisory {
  module_name: string
  patched_versions: string
  severity: string
}

interface AuditResult {
  advisories?: Record<string, AuditAdvisory>
}

function audit(): AuditResult {
  try {
    const output = execSync('pnpm audit --json', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return JSON.parse(output)
  } catch (e: unknown) {
    const stdout = (e as { stdout?: string }).stdout ?? ''
    try {
      return JSON.parse(stdout)
    } catch {
      throw new Error('pnpm audit did not return valid JSON')
    }
  }
}

function basePackageName(p: string): string {
  if (p.startsWith('@')) {
    const slashIdx = p.indexOf('/')
    if (slashIdx < 0) return p
    const atIdx = p.indexOf('@', slashIdx + 1)
    return atIdx >= 0 ? p.slice(0, atIdx) : p
  }
  const atIdx = p.indexOf('@')
  return atIdx >= 0 ? p.slice(0, atIdx) : p
}

const originalWorkspaceContent = readFileSync(WORKSPACE_PATH, 'utf8')
const originalOverrides = parseOverrides(originalWorkspaceContent)
const originalExcluded = parseReleaseAgeExclude(originalWorkspaceContent)

console.log('Removing all overrides and updating dependencies...')
updateOverrides({})
const overridePackageNames = Object.keys(originalOverrides)

const phase1Excluded: string[] = [...originalExcluded]
updateReleaseAgeExclude(phase1Excluded)

function runUpdate(): void {
  if (overridePackageNames.length > 0) {
    execSync(
      `pnpm update -r --depth Infinity ${overridePackageNames.join(' ')} --lockfile-only`,
      { stdio: 'pipe' },
    )
  } else {
    execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
  }
}

const MAX_RETRIES = 10
const phase1Result = retryWithReleaseAge({
  run: runUpdate,
  onAdd: (pkg) => {
    console.log(`  Adding ${pkg} to minimumReleaseAgeExclude and retrying...`)
    phase1Excluded.push(pkg)
    updateReleaseAgeExclude(phase1Excluded)
  },
  isExcluded: (pkg) => phase1Excluded.includes(pkg),
  maxRetries: MAX_RETRIES,
})
if (!phase1Result.success) {
  throw phase1Result.lastError ?? new Error('pnpm update failed')
}

execSync(`git checkout -- ${WORKSPACE_PATH}`, { stdio: 'pipe' })

const installable: Record<string, string> = {}
const excluded: string[] = [...phase1Excluded]
updateOverrides(installable)
updateReleaseAgeExclude(excluded)
const scriptAddedExcludes = new Set<string>(
  phase1Excluded.filter((p) => !originalExcluded.includes(p)),
)

const skipped = new Set<string>()
const MAX_AUDIT_ROUNDS = 5
for (let round = 0; round < MAX_AUDIT_ROUNDS; round++) {
  const result = audit()
  const advisories = Object.values(result.advisories ?? {})
  const needed = collectNeeded(advisories)

  const toApply: Record<string, string> = {}
  for (const [pkg, version] of Object.entries(needed)) {
    if (installable[pkg] !== version && !skipped.has(pkg)) {
      toApply[pkg] = version
    }
  }

  if (Object.keys(toApply).length === 0) break

  console.log(
    round === 0
      ? '\nApplying overrides...'
      : `\nRe-audit round ${round + 1}: found additional vulnerabilities`,
  )
  for (const [pkg, version] of Object.entries(toApply)) {
    console.log(`  ${pkg}@${version}`)
  }

  for (const [pkg, version] of Object.entries(toApply)) {
    updateOverrides({ ...installable, [pkg]: version })

    const addedForThisPkg: string[] = []
    let success = false
    let lastError: unknown
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
        success = true
        break
      } catch (e: unknown) {
        lastError = e
        const stdout = ((e as { stdout?: Buffer }).stdout ?? '').toString()
        const failingPkg = parseReleaseAgeFailedPackage(stdout)
        if (!failingPkg || excluded.includes(failingPkg)) break
        console.log(
          `  Adding ${failingPkg} to minimumReleaseAgeExclude and retrying...`,
        )
        excluded.push(failingPkg)
        scriptAddedExcludes.add(failingPkg)
        addedForThisPkg.push(failingPkg)
        updateReleaseAgeExclude(excluded)
      }
    }

    if (success) {
      installable[pkg] = version
    } else {
      const stderr = ((lastError as { stderr?: Buffer }).stderr ?? '')
        .toString()
        .trim()
      if (stderr) {
        console.log(`  Error: ${stderr.split('\n')[0]}`)
      }
      for (const p of [...addedForThisPkg].reverse()) {
        const idx = excluded.lastIndexOf(p)
        if (idx >= 0) excluded.splice(idx, 1)
        scriptAddedExcludes.delete(p)
      }
      updateReleaseAgeExclude(excluded)
      console.log(`  Skipped: ${pkg}@${version}`)
      skipped.add(pkg)
    }
  }

  updateOverrides(installable)
  updateReleaseAgeExclude(
    excluded.filter((p) => !scriptAddedExcludes.has(p) || !!installable[basePackageName(p)]),
  )
  execSync('pnpm install --lockfile-only', { stdio: 'pipe' })

  if (round + 1 === MAX_AUDIT_ROUNDS) {
    console.error(
      `\nWARNING: reached max audit rounds (${MAX_AUDIT_ROUNDS}). Unresolved vulnerabilities may remain.`,
    )
    process.exitCode = 1
  }
}

const added = Object.keys(installable).filter((k) => !originalOverrides[k])
const removed = Object.keys(originalOverrides).filter((k) => !installable[k])
const updated = Object.keys(installable).filter(
  (k) => originalOverrides[k] && originalOverrides[k] !== installable[k],
)
const kept = Object.keys(installable).filter(
  (k) => originalOverrides[k] === installable[k],
)

console.log('\nResult:')
if (added.length > 0) {
  console.log(
    `  Added: ${added.map((k) => `${k}@${installable[k]}`).join(', ')}`,
  )
}
if (removed.length > 0) {
  console.log(`  Removed: ${removed.join(', ')}`)
}
if (updated.length > 0) {
  console.log(
    `  Updated: ${updated.map((k) => `${k}: ${originalOverrides[k]} → ${installable[k]}`).join(', ')}`,
  )
}
if (kept.length > 0) {
  console.log(`  Kept: ${kept.map((k) => `${k}@${installable[k]}`).join(', ')}`)
}

if (installable.esbuild) {
  const current = parseReleaseAgeExclude(readFileSync(WORKSPACE_PATH, 'utf8'))
  const needed = ['@esbuild/*', 'esbuild'].filter((p) => !current.includes(p))
  if (needed.length > 0) {
    updateReleaseAgeExclude([...current, ...needed])
    execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
  }
}

const finalExcluded = parseReleaseAgeExclude(
  readFileSync(WORKSPACE_PATH, 'utf8'),
)
const excludeChanged =
  finalExcluded.length !== originalExcluded.length ||
  finalExcluded.some((p) => !originalExcluded.includes(p))

const hasChanges =
  added.length > 0 || removed.length > 0 || updated.length > 0 || excludeChanged

if (!hasChanges) {
  console.log('\nNo changes needed.')
  writeFileSync(WORKSPACE_PATH, originalWorkspaceContent)
  execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
  process.exit(0)
}

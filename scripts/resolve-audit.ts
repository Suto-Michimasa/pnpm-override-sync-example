import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { collectNeeded } from './utils/override-versions.ts'
import {
  applyReleaseAgeExclude,
  parseReleaseAgeExclude,
} from './utils/release-age-exclude.ts'

const PKG_PATH = 'package.json'
const WORKSPACE_PATH = 'pnpm-workspace.yaml'

function updateReleaseAgeExclude(packages: string[]): void {
  const content = readFileSync(WORKSPACE_PATH, 'utf8')
  writeFileSync(WORKSPACE_PATH, applyReleaseAgeExclude(content, packages))
}

const RELEASE_AGE_ERROR = 'ERR_PNPM_NO_MATURE_MATCHING_VERSION'

function parseReleaseAgeErrorPackage(stdout: string): string | undefined {
  const match = stdout.match(
    /of\s+(\S+)\s+does not meet the minimumReleaseAge constraint/,
  )
  return match?.[1]
}

interface PackageJson {
  pnpm?: {
    overrides?: Record<string, string>
    [key: string]: unknown
  }
  [key: string]: unknown
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
    // pnpm audit は脆弱性があると非ゼロで終了するため catch 側でもパースする
    const stdout = (e as { stdout?: string }).stdout ?? ''
    try {
      return JSON.parse(stdout)
    } catch {
      // registry エラー等で JSON が返らない場合、空結果で続行すると
      // 全 override が不要と誤判定されるため失敗させる
      throw new Error('pnpm audit did not return valid JSON')
    }
  }
}

function writePkg(pkg: PackageJson): void {
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
}

const original: PackageJson = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
const originalOverrides = original.pnpm?.overrides ?? {}

console.log('Removing all overrides and updating dependencies...')
const clean: PackageJson = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
if (clean.pnpm?.overrides) {
  delete clean.pnpm.overrides
}
if (clean.pnpm && Object.keys(clean.pnpm).length === 0) {
  delete clean.pnpm
}
writePkg(clean)
// pnpm update -r（全パッケージ更新）は catalog の specifier を壊すため、
// override 対象パッケージだけを指定して更新する。
const overridePackageNames = Object.keys(originalOverrides)
const phase1Excluded: string[] = parseReleaseAgeExclude(
  readFileSync(WORKSPACE_PATH, 'utf8'),
)
const phase1ExcludedInitialLength = phase1Excluded.length

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
for (let i = 0; ; i++) {
  try {
    runUpdate()
    break
  } catch (e: unknown) {
    const stdout = ((e as { stdout?: Buffer }).stdout ?? '').toString()
    const pkg = stdout.includes(RELEASE_AGE_ERROR)
      ? parseReleaseAgeErrorPackage(stdout)
      : undefined
    if (!pkg || i + 1 >= MAX_RETRIES) {
      throw e
    }
    console.log(
      `  Adding ${pkg} to minimumReleaseAgeExclude and retrying...`,
    )
    phase1Excluded.push(pkg)
    updateReleaseAgeExclude(phase1Excluded)
  }
}

// pnpm update が pnpm-workspace.yaml の catalog を壊すため即座に復元する
execSync(`git checkout -- ${WORKSPACE_PATH}`, { stdio: 'pipe' })

const installable: Record<string, string> = {}
const phase1Added = phase1Excluded.slice(phase1ExcludedInitialLength)
const excluded: string[] = [
  ...parseReleaseAgeExclude(readFileSync(WORKSPACE_PATH, 'utf8')),
  ...phase1Added,
]
if (phase1Added.length > 0) {
  updateReleaseAgeExclude(excluded)
}
const scriptAddedExcludes = new Set<string>(phase1Added)

const MAX_AUDIT_ROUNDS = 5
for (let round = 0; round < MAX_AUDIT_ROUNDS; round++) {
  const result = audit()
  const advisories = Object.values(result.advisories ?? {})
  const needed = collectNeeded(advisories)

  const toApply: Record<string, string> = {}
  for (const [pkg, version] of Object.entries(needed)) {
    if (installable[pkg] !== version) {
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
    const trial: PackageJson = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
    if (!trial.pnpm) {
      trial.pnpm = {}
    }
    trial.pnpm.overrides = { ...installable, [pkg]: version }
    writePkg(trial)
    try {
      execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
      installable[pkg] = version
    } catch {
      console.log(
        `  Retrying with minimumReleaseAgeExclude: ${pkg}@${version}`,
      )
      excluded.push(pkg)
      scriptAddedExcludes.add(pkg)
      updateReleaseAgeExclude(excluded)
      try {
        execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
        installable[pkg] = version
      } catch {
        const removed = excluded.pop()!
        scriptAddedExcludes.delete(removed)
        updateReleaseAgeExclude(excluded)
        console.log(`  Skipped: ${pkg}@${version}`)
      }
    }
  }

  const current: PackageJson = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
  if (Object.keys(installable).length > 0) {
    if (!current.pnpm) {
      current.pnpm = {}
    }
    current.pnpm.overrides = installable
  } else if (current.pnpm?.overrides) {
    delete current.pnpm.overrides
    if (Object.keys(current.pnpm).length === 0) {
      delete current.pnpm
    }
  }
  writePkg(current)
  updateReleaseAgeExclude(
    excluded.filter((p) => !scriptAddedExcludes.has(p) || installable[p]),
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
  console.log(
    `  Kept: ${kept.map((k) => `${k}@${installable[k]}`).join(', ')}`,
  )
}

const hasChanges = added.length > 0 || removed.length > 0 || updated.length > 0

if (!hasChanges) {
  console.log('\nNo changes needed.')
  writePkg(original)
  execSync(`git checkout -- ${WORKSPACE_PATH}`, { stdio: 'pipe' })
  execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
  process.exit(0)
}

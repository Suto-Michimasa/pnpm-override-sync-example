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
// override 対象パッケージだけを指定して更新する
const overridePackageNames = Object.keys(originalOverrides)
if (overridePackageNames.length > 0) {
  execSync(
    `pnpm update -r --depth Infinity ${overridePackageNames.join(' ')} --lockfile-only`,
    { stdio: 'pipe' },
  )
} else {
  execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
}

// pnpm update が pnpm-workspace.yaml の catalog を壊すため即座に復元する
execSync(`git checkout -- ${WORKSPACE_PATH}`, { stdio: 'pipe' })

const result = audit()
const advisories = Object.values(result.advisories ?? {})
const needed = collectNeeded(advisories)

const added = Object.keys(needed).filter((k) => !originalOverrides[k])
const removed = Object.keys(originalOverrides).filter((k) => !needed[k])
const kept = Object.keys(needed).filter((k) => originalOverrides[k])

console.log('\nResult:')
if (added.length > 0) {
  console.log(`  Added: ${added.map((k) => `${k}@${needed[k]}`).join(', ')}`)
}
if (removed.length > 0) {
  console.log(`  Removed: ${removed.join(', ')}`)
}
if (kept.length > 0) {
  console.log(`  Kept: ${kept.map((k) => `${k}@${needed[k]}`).join(', ')}`)
}

const hasChanges =
  added.length > 0 ||
  removed.length > 0 ||
  kept.some((k) => originalOverrides[k] !== needed[k])

if (!hasChanges) {
  console.log('\nNo changes needed.')
  writePkg(original)
  execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
  process.exit(0)
}

console.log('\nApplying changes...')
const installable: Record<string, string> = {}
const excluded: string[] = parseReleaseAgeExclude(
  readFileSync(WORKSPACE_PATH, 'utf8'),
)
for (const [pkg, version] of Object.entries(needed)) {
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
    console.log(`  Retrying with minimumReleaseAgeExclude: ${pkg}@${version}`)
    excluded.push(pkg)
    updateReleaseAgeExclude(excluded)
    try {
      execSync('pnpm install --lockfile-only', { stdio: 'pipe' })
      installable[pkg] = version
    } catch {
      excluded.pop()
      updateReleaseAgeExclude(excluded)
      console.log(`  Skipped: ${pkg}@${version}`)
    }
  }
}

const final: PackageJson = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
if (Object.keys(installable).length > 0) {
  if (!final.pnpm) {
    final.pnpm = {}
  }
  final.pnpm.overrides = installable
} else if (final.pnpm?.overrides) {
  delete final.pnpm.overrides
  if (Object.keys(final.pnpm).length === 0) {
    delete final.pnpm
  }
}
writePkg(final)
updateReleaseAgeExclude(excluded.filter((pkg) => installable[pkg]))
execSync('pnpm install --lockfile-only', { stdio: 'pipe' })

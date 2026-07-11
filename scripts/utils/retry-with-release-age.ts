const RELEASE_AGE_ERROR = 'ERR_PNPM_NO_MATURE_MATCHING_VERSION'

export function parseReleaseAgeFailedPackage(
  stdout: string,
): string | undefined {
  if (!stdout.includes(RELEASE_AGE_ERROR)) return undefined
  const match = stdout.match(
    /of\s+(\S+)\s+does not meet the minimumReleaseAge constraint/,
  )
  return match?.[1]
}

export interface RetryWithReleaseAgeOptions {
  run: () => void
  onAdd: (pkg: string) => void
  isExcluded: (pkg: string) => boolean
  maxRetries: number
}

export interface RetryResult {
  success: boolean
  added: string[]
  lastError?: unknown
}

export function retryWithReleaseAge(
  options: RetryWithReleaseAgeOptions,
): RetryResult {
  const added: string[] = []
  let lastError: unknown
  for (let i = 0; i < options.maxRetries; i++) {
    try {
      options.run()
      return { success: true, added }
    } catch (e: unknown) {
      lastError = e
      const stdout = (
        (e as { stdout?: { toString(): string } }).stdout ?? ''
      ).toString()
      const pkg = parseReleaseAgeFailedPackage(stdout)
      if (!pkg || options.isExcluded(pkg)) {
        return { success: false, added, lastError }
      }
      added.push(pkg)
      options.onAdd(pkg)
    }
  }
  return { success: false, added, lastError }
}

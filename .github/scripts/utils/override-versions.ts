function compareSemver(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function extractMaxVersion(range: string): number[] | null {
  let max: number[] | null = null
  for (const part of range.split('||')) {
    const match = part.match(/(\d+)\.(\d+)\.(\d+)/)
    if (!match) continue
    const ver = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (!max || compareSemver(ver, max) > 0) {
      max = ver
    }
  }
  return max
}

export function collectNeeded(
  advisories: { module_name: string; patched_versions: string }[],
): Record<string, string> {
  const needed: Record<string, string> = {}
  for (const { module_name, patched_versions } of advisories) {
    if (!module_name || !patched_versions) continue
    const current = needed[module_name]
    if (!current) {
      needed[module_name] = patched_versions
    } else {
      const currentMax = extractMaxVersion(current)
      const newMax = extractMaxVersion(patched_versions)
      if (currentMax && newMax && compareSemver(newMax, currentMax) > 0) {
        needed[module_name] = patched_versions
      }
    }
  }
  return needed
}

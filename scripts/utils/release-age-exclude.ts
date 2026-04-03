export function parseReleaseAgeExclude(content: string): string[] {
  const match = content.match(/minimumReleaseAgeExclude:\n(( {2}- .+\n)*)/)
  if (!match) return []
  return match[1]
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => line.replace(/^ {2}- /, '').trim())
}

export function applyReleaseAgeExclude(
  content: string,
  packages: string[],
): string {
  let result = content.replace(/minimumReleaseAgeExclude:\n( {2}- .+\n)*/, '')
  result = `${result.trimEnd()}\n`
  if (packages.length > 0) {
    const entries = packages.map((p) => `  - ${p}`).join('\n')
    result += `minimumReleaseAgeExclude:\n${entries}\n`
  }
  return result
}

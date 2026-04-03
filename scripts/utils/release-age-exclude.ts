export function parseReleaseAgeExclude(content: string): string[] {
  const match = content.match(
    /minimumReleaseAgeExclude:\r?\n(( {2}- .+\r?\n?)*)/,
  )
  if (!match) return []
  return match[1]
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => line.replace(/^ {2}- /, '').trim())
}

export function applyReleaseAgeExclude(
  content: string,
  packages: string[],
): string {
  let result = content.replace(
    /minimumReleaseAgeExclude:\r?\n( {2}- .+\r?\n?)*/,
    '',
  )
  result = `${result.trimEnd()}\n`
  const unique = [...new Set(packages)]
  if (unique.length > 0) {
    const entries = unique.map((p) => `  - ${p}`).join('\n')
    result += `minimumReleaseAgeExclude:\n${entries}\n`
  }
  return result
}

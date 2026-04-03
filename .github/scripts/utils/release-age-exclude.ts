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

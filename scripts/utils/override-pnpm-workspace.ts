function escapeYamlDoubleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function unescapeYamlDoubleQuoted(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => c)
}

export function parseOverrides(content: string): Record<string, string> {
  const match = content.match(
    /^overrides:\r?\n((?: {2}\S[^\n]*\r?\n?)*)/m,
  )
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const m = line.match(
      /^ {2}(?:"((?:[^"\\]|\\.)+)"|'([^']+)'|([^:\s][^:]*?))\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S.*?))\s*$/,
    )
    if (!m) continue
    const key = m[1] !== undefined ? unescapeYamlDoubleQuoted(m[1]) : (m[2] ?? m[3])
    const value =
      m[4] !== undefined ? unescapeYamlDoubleQuoted(m[4]) : (m[5] ?? m[6])
    if (key !== undefined && value !== undefined) {
      result[key] = value
    }
  }
  return result
}

function needsQuote(key: string): boolean {
  return key.startsWith('@') || /[:#\s"\\]/.test(key)
}

function buildOverridesBlock(overrides: Record<string, string>): string {
  const keys = Object.keys(overrides)
  if (keys.length === 0) return ''
  const entries = keys
    .map((k) => {
      const key = needsQuote(k) ? `"${escapeYamlDoubleQuoted(k)}"` : k
      const value = `"${escapeYamlDoubleQuoted(overrides[k])}"`
      return `  ${key}: ${value}`
    })
    .join('\n')
  return `overrides:\n${entries}\n`
}

export function applyOverrides(
  content: string,
  overrides: Record<string, string>,
): string {
  let result = content.replace(
    /^overrides:\r?\n(?: {2}\S[^\n]*\r?\n?)*/m,
    '',
  )
  result = result.replace(/\n{3,}/g, '\n\n')

  const block = buildOverridesBlock(overrides)
  if (!block) return result

  if (/^catalog:/m.test(result)) {
    return result.replace(/^catalog:/m, `${block}\ncatalog:`)
  }
  return `${result.replace(/\n+$/, '')}\n\n${block}`
}

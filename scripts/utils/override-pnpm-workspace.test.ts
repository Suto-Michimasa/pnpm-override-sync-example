import { describe, expect, test } from 'vitest'
import { applyOverrides, parseOverrides } from './override-pnpm-workspace'

const base = `packages:
  - 'packages/*'
allowBuilds:
  '@swc/core': true

catalog:
  react: "^19.0.0"

minimumReleaseAge: 10080
`

describe('applyOverrides', () => {
  test('overrides を catalog の前に挿入する', () => {
    const result = applyOverrides(base, { lodash: '>=4.18.0' })
    expect(result).toBe(`packages:
  - 'packages/*'
allowBuilds:
  '@swc/core': true

overrides:
  lodash: ">=4.18.0"

catalog:
  react: "^19.0.0"

minimumReleaseAge: 10080
`)
  })

  test('複数 overrides を挿入する', () => {
    const result = applyOverrides(base, {
      lodash: '>=4.18.0',
      'fast-xml-builder': '>=1.1.7',
    })
    expect(result).toContain(
      'overrides:\n  lodash: ">=4.18.0"\n  fast-xml-builder: ">=1.1.7"\n',
    )
  })

  test('空オブジェクトで既存の overrides を削除する', () => {
    const withOverrides = applyOverrides(base, { lodash: '>=4.18.0' })
    const cleared = applyOverrides(withOverrides, {})
    expect(cleared).toBe(base)
  })

  test('既存の overrides を置き換える', () => {
    const withOverrides = applyOverrides(base, { lodash: '>=4.18.0' })
    const replaced = applyOverrides(withOverrides, { axios: '>=1.0.0' })
    expect(replaced).toContain('overrides:\n  axios: ">=1.0.0"\n')
    expect(replaced).not.toContain('lodash')
  })

  test('スコープ付きパッケージ名をクォートする', () => {
    const result = applyOverrides(base, { '@types/node': '>=20.0.0' })
    expect(result).toContain('  "@types/node": ">=20.0.0"\n')
  })

  test('スコープなしパッケージ名はクォートしない', () => {
    const result = applyOverrides(base, { lodash: '>=4.18.0' })
    expect(result).toContain('  lodash: ">=4.18.0"\n')
    expect(result).not.toContain('"lodash"')
  })

  test('catalog がない場合は末尾に追加する', () => {
    const noCatalog = `packages:\n  - 'packages/*'\n`
    const result = applyOverrides(noCatalog, { lodash: '>=4.18.0' })
    expect(result).toContain('\noverrides:\n  lodash: ">=4.18.0"\n')
  })
})

describe('parseOverrides', () => {
  test('overrides をパースする', () => {
    const content = `${base}overrides:\n  lodash: ">=4.18.0"\n`
    expect(parseOverrides(content)).toEqual({ lodash: '>=4.18.0' })
  })

  test('複数 overrides をパースする', () => {
    const content = `overrides:\n  lodash: ">=4.18.0"\n  axios: ">=1.0.0"\n`
    expect(parseOverrides(content)).toEqual({
      lodash: '>=4.18.0',
      axios: '>=1.0.0',
    })
  })

  test('overrides がない場合は空オブジェクトを返す', () => {
    expect(parseOverrides(base)).toEqual({})
  })

  test('シングルクォートでもパースできる', () => {
    const content = `overrides:\n  lodash: '>=4.18.0'\n`
    expect(parseOverrides(content)).toEqual({ lodash: '>=4.18.0' })
  })

  test('クォートなしでもパースできる', () => {
    const content = `overrides:\n  lodash: latest\n`
    expect(parseOverrides(content)).toEqual({ lodash: 'latest' })
  })

  test('クォート付きスコープパッケージをパースする', () => {
    const content = `overrides:\n  "@types/node": ">=20.0.0"\n`
    expect(parseOverrides(content)).toEqual({ '@types/node': '>=20.0.0' })
  })

  test('CRLF でもパースできる', () => {
    const content = `overrides:\r\n  lodash: ">=4.18.0"\r\n  axios: ">=1.0.0"\r\n`
    expect(parseOverrides(content)).toEqual({
      lodash: '>=4.18.0',
      axios: '>=1.0.0',
    })
  })
})

describe('applyOverrides + parseOverrides ラウンドトリップ', () => {
  test('apply してから parse すると元に戻る', () => {
    const overrides = {
      lodash: '>=4.18.0',
      'fast-xml-builder': '>=1.1.7',
      '@types/node': '>=20.0.0',
    }
    const result = applyOverrides(base, overrides)
    expect(parseOverrides(result)).toEqual(overrides)
  })

  test('ダブルクォートやバックスラッシュを含む値も壊れない', () => {
    const overrides = {
      'weird-quote': 'a"b',
      'weird-backslash': 'a\\b',
      'weird-both': 'a"b\\c',
    }
    const result = applyOverrides(base, overrides)
    expect(result).toContain('  weird-quote: "a\\"b"')
    expect(result).toContain('  weird-backslash: "a\\\\b"')
    expect(parseOverrides(result)).toEqual(overrides)
  })

  test('キーにダブルクォートやバックスラッシュを含んでも壊れない', () => {
    const overrides = { 'a"b\\c': '>=1.0.0' }
    const result = applyOverrides(base, overrides)
    expect(parseOverrides(result)).toEqual(overrides)
  })
})

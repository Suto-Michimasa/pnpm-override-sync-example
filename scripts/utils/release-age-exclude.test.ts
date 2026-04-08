import { describe, expect, test } from 'vitest'
import {
  applyReleaseAgeExclude,
  parseReleaseAgeExclude,
} from './release-age-exclude'

const base = `packages:
  - 'packages/*'

catalog:
  react: "^19.0.0"

minimumReleaseAge: 10080
`

describe('applyReleaseAgeExclude', () => {
  test('パッケージを追加する', () => {
    const result = applyReleaseAgeExclude(base, ['lodash'])
    expect(result).toBe(`packages:
  - 'packages/*'

catalog:
  react: "^19.0.0"

minimumReleaseAge: 10080
minimumReleaseAgeExclude:
  - lodash
`)
  })

  test('複数パッケージを追加する', () => {
    const result = applyReleaseAgeExclude(base, ['lodash', 'axios'])
    expect(result).toContain('  - lodash\n  - axios\n')
  })

  test('空配列で既存の exclude を削除する', () => {
    const withExclude = `${base}minimumReleaseAgeExclude:\n  - lodash\n`
    const result = applyReleaseAgeExclude(withExclude, [])
    expect(result).toBe(base)
  })

  test('既存の exclude を置き換える', () => {
    const withExclude = `${base}minimumReleaseAgeExclude:\n  - lodash\n`
    const result = applyReleaseAgeExclude(withExclude, ['axios'])
    expect(result).toContain('minimumReleaseAgeExclude:\n  - axios\n')
    expect(result).not.toContain('lodash')
  })

  test('exclude がない状態から追加する', () => {
    const result = applyReleaseAgeExclude(base, ['lodash'])
    expect(result).toContain('minimumReleaseAgeExclude:\n  - lodash\n')
  })

  test('minimumReleaseAge より前の内容は変わらない', () => {
    const result = applyReleaseAgeExclude(base, ['lodash'])
    expect(result).toContain("catalog:\n  react: \"^19.0.0\"")
  })

  test('重複するパッケージは1つにまとめる', () => {
    const result = applyReleaseAgeExclude(base, ['lodash', 'lodash'])
    const matches = result.match(/  - lodash/g)
    expect(matches).toHaveLength(1)
  })

  test('スコープ付きパッケージ名をクォートする', () => {
    const result = applyReleaseAgeExclude(base, ['@hono/node-server'])
    expect(result).toContain('  - "@hono/node-server"\n')
  })

  test('スコープなしパッケージ名はクォートしない', () => {
    const result = applyReleaseAgeExclude(base, ['lodash'])
    expect(result).toContain('  - lodash\n')
    expect(result).not.toContain('"lodash"')
  })
})

describe('parseReleaseAgeExclude', () => {
  test('exclude がある場合にパッケージ名を返す', () => {
    const content = `${base}minimumReleaseAgeExclude:\n  - lodash\n`
    expect(parseReleaseAgeExclude(content)).toEqual(['lodash'])
  })

  test('複数パッケージをパースする', () => {
    const content = `${base}minimumReleaseAgeExclude:\n  - lodash\n  - axios\n`
    expect(parseReleaseAgeExclude(content)).toEqual(['lodash', 'axios'])
  })

  test('exclude がない場合は空配列を返す', () => {
    expect(parseReleaseAgeExclude(base)).toEqual([])
  })

  test('末尾改行なしでもパースできる', () => {
    const content = `${base}minimumReleaseAgeExclude:\n  - lodash`
    expect(parseReleaseAgeExclude(content)).toEqual(['lodash'])
  })

  test('CRLF でもパースできる', () => {
    const content = `minimumReleaseAge: 10080\r\nminimumReleaseAgeExclude:\r\n  - lodash\r\n  - axios\r\n`
    expect(parseReleaseAgeExclude(content)).toEqual(['lodash', 'axios'])
  })

  test('クォート付きパッケージ名のクォートを除去する', () => {
    const content = `${base}minimumReleaseAgeExclude:\n  - "@hono/node-server"\n`
    expect(parseReleaseAgeExclude(content)).toEqual(['@hono/node-server'])
  })
})

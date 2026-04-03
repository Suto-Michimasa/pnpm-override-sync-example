import { describe, expect, test } from 'vitest'
import { applyReleaseAgeExclude } from './release-age-exclude'

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
})

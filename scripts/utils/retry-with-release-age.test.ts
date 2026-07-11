import { describe, expect, test, vi } from 'vitest'
import {
  parseReleaseAgeFailedPackage,
  retryWithReleaseAge,
} from './retry-with-release-age'

function releaseAgeError(pkg: string): Error & { stdout: string } {
  const err = new Error('install failed') as Error & { stdout: string }
  err.stdout = `
 ERR_PNPM_NO_MATURE_MATCHING_VERSION  Version x.y.z (released N days ago) of ${pkg} does not meet the minimumReleaseAge constraint
`
  return err
}

describe('parseReleaseAgeFailedPackage', () => {
  test('release-age エラーからパッケージ名を抽出する', () => {
    expect(parseReleaseAgeFailedPackage(releaseAgeError('uuid').stdout)).toBe(
      'uuid',
    )
  })

  test('スコープ付き・ハイフン含みも抽出できる', () => {
    expect(
      parseReleaseAgeFailedPackage(releaseAgeError('@scope/pkg').stdout),
    ).toBe('@scope/pkg')
    expect(
      parseReleaseAgeFailedPackage(releaseAgeError('fast-xml-parser').stdout),
    ).toBe('fast-xml-parser')
  })

  test('release-age 以外のエラー文字列では undefined', () => {
    expect(parseReleaseAgeFailedPackage('peer conflict')).toBeUndefined()
  })
})

describe('retryWithReleaseAge', () => {
  test('1 回目で成功 → added は空', () => {
    const run = vi.fn()
    const onAdd = vi.fn()
    const result = retryWithReleaseAge({
      run,
      onAdd,
      isExcluded: () => false,
      maxRetries: 5,
    })
    expect(result).toEqual({ success: true, added: [] })
    expect(run).toHaveBeenCalledTimes(1)
    expect(onAdd).not.toHaveBeenCalled()
  })

  test('release-age 失敗 → exclude 追加 → 2 回目成功', () => {
    const added: string[] = []
    let attempt = 0
    const run = vi.fn(() => {
      attempt++
      if (attempt === 1) throw releaseAgeError('uuid')
    })
    const result = retryWithReleaseAge({
      run,
      onAdd: (p) => added.push(p),
      isExcluded: (p) => added.includes(p),
      maxRetries: 5,
    })
    expect(result.success).toBe(true)
    expect(result.added).toEqual(['uuid'])
    expect(run).toHaveBeenCalledTimes(2)
  })

  test('推移的依存が段階的に失敗 → 各段階で exclude 追加して成功', () => {
    const added: string[] = []
    let attempt = 0
    const run = vi.fn(() => {
      attempt++
      if (attempt === 1) throw releaseAgeError('fast-xml-parser')
      if (attempt === 2) throw releaseAgeError('fast-xml-builder')
    })
    const result = retryWithReleaseAge({
      run,
      onAdd: (p) => added.push(p),
      isExcluded: (p) => added.includes(p),
      maxRetries: 5,
    })
    expect(result.success).toBe(true)
    expect(result.added).toEqual(['fast-xml-parser', 'fast-xml-builder'])
    expect(run).toHaveBeenCalledTimes(3)
  })

  test('release-age 以外のエラーは即停止（lastError を返す）', () => {
    const err = new Error('peer conflict') as Error & { stdout: string }
    err.stdout = 'ERR_PNPM_PEER_DEPENDENCY_CONFLICT'
    const run = vi.fn(() => {
      throw err
    })
    const onAdd = vi.fn()
    const result = retryWithReleaseAge({
      run,
      onAdd,
      isExcluded: () => false,
      maxRetries: 5,
    })
    expect(result.success).toBe(false)
    expect(result.added).toEqual([])
    expect(result.lastError).toBe(err)
    expect(run).toHaveBeenCalledTimes(1)
    expect(onAdd).not.toHaveBeenCalled()
  })

  test('同一パッケージが再検出されたら停止（無限ループ防止）', () => {
    const alreadyExcluded = new Set(['uuid'])
    const run = vi.fn(() => {
      throw releaseAgeError('uuid')
    })
    const result = retryWithReleaseAge({
      run,
      onAdd: () => {},
      isExcluded: (p) => alreadyExcluded.has(p),
      maxRetries: 5,
    })
    expect(result.success).toBe(false)
    expect(result.added).toEqual([])
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('maxRetries を超えたら停止', () => {
    let counter = 0
    const run = vi.fn(() => {
      counter++
      throw releaseAgeError(`pkg-${counter}`)
    })
    const result = retryWithReleaseAge({
      run,
      onAdd: () => {},
      isExcluded: () => false,
      maxRetries: 3,
    })
    expect(result.success).toBe(false)
    expect(result.added).toEqual(['pkg-1', 'pkg-2', 'pkg-3'])
    expect(run).toHaveBeenCalledTimes(3)
  })

  test('toString() を持つオブジェクト（Buffer 相当）の stdout でもパースできる', () => {
    const message =
      'ERR_PNPM_NO_MATURE_MATCHING_VERSION Version 1.0.0 of lodash does not meet the minimumReleaseAge constraint'
    const err = new Error('failed') as Error & {
      stdout: { toString(): string }
    }
    err.stdout = { toString: () => message }
    let threw = false
    const run = vi.fn(() => {
      if (!threw) {
        threw = true
        throw err
      }
    })
    const added: string[] = []
    const result = retryWithReleaseAge({
      run,
      onAdd: (p) => added.push(p),
      isExcluded: () => false,
      maxRetries: 3,
    })
    expect(result.success).toBe(true)
    expect(result.added).toEqual(['lodash'])
  })
})

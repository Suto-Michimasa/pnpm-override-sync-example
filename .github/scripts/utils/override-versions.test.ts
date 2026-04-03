import { describe, expect, test } from 'vitest'
import { collectNeeded } from './override-versions'

describe('collectNeeded', () => {
  test('単一 advisory はそのまま採用される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=1.2.3' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=1.2.3' })
  })

  test('同一パッケージの複数 advisory から最も高いバージョンが採用される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=2.3.2' },
      { module_name: 'pkg-a', patched_versions: '>=4.0.4' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=4.0.4' })
  })

  test('順序が逆でも最も高いバージョンが採用される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=4.0.4' },
      { module_name: 'pkg-a', patched_versions: '>=2.3.2' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=4.0.4' })
  })

  test('文字列辞書順で誤判定されるケース（patch 桁数違い）が正しく処理される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=4.0.4' },
      { module_name: 'pkg-a', patched_versions: '>=4.0.10' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=4.0.10' })
  })

  test('文字列辞書順で誤判定されるケース（major 桁数違い）が正しく処理される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=9.0.0' },
      { module_name: 'pkg-a', patched_versions: '>=10.0.0' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=10.0.0' })
  })

  test('異なるパッケージは独立して処理される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=1.0.0' },
      { module_name: 'pkg-b', patched_versions: '>=2.0.0' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=1.0.0', 'pkg-b': '>=2.0.0' })
  })

  test('module_name や patched_versions が空の advisory はスキップされる', () => {
    const result = collectNeeded([
      { module_name: '', patched_versions: '>=1.0.0' },
      { module_name: 'pkg-a', patched_versions: '' },
      { module_name: 'pkg-b', patched_versions: '>=2.0.0' },
    ])
    expect(result).toEqual({ 'pkg-b': '>=2.0.0' })
  })

  test('上限付きレンジからもバージョンが抽出され比較される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=1.2.3 <2.0.0' },
      { module_name: 'pkg-a', patched_versions: '>=4.0.4' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=4.0.4' })
  })

  test('複合レンジは元の文字列がそのまま保持される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=1.2.3 <2.0.0 || >=3.0.1' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=1.2.3 <2.0.0 || >=3.0.1' })
  })

  test('複合レンジの最大バージョンで他の advisory と比較し、高い方の元文字列が採用される', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=2.3.2' },
      {
        module_name: 'pkg-a',
        patched_versions: '>=4.0.4 <5.0.0 || >=5.1.0',
      },
    ])
    expect(result).toEqual({ 'pkg-a': '>=4.0.4 <5.0.0 || >=5.1.0' })
  })

  test('単一レンジの方が高ければそちらが採用される', () => {
    const result = collectNeeded([
      {
        module_name: 'pkg-a',
        patched_versions: '>=1.2.3 <2.0.0 || >=3.0.1 <3.2.0',
      },
      { module_name: 'pkg-a', patched_versions: '>=5.0.0' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=5.0.0' })
  })

  test('3件以上の advisory から最大が選ばれる', () => {
    const result = collectNeeded([
      { module_name: 'pkg-a', patched_versions: '>=1.0.0' },
      { module_name: 'pkg-a', patched_versions: '>=3.0.0' },
      { module_name: 'pkg-a', patched_versions: '>=2.0.0' },
    ])
    expect(result).toEqual({ 'pkg-a': '>=3.0.0' })
  })
})

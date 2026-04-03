# pnpm-override-sync-example

pnpm overrides の自動同期の仕組みを紹介する tech blog 記事のサンプルリポジトリです。

> このリポジトリは記事の説明用に作成した架空のプロジェクトです。実際のプロダクトではありません。

## 記事

[minimumReleaseAge と脆弱性修正を両立しながら依存管理をクリーンに保つ](https://zenn.dev/pkshatech/articles/nodejs-vulnerability-clean-overrides)

## 構成

```
├── packages/
│   ├── web/          # Vite + React + TypeScript（フロントエンド）
│   └── api/          # Hono + Prisma（バックエンド）
├── scripts/
│   ├── resolve-audit.ts          # override 自動同期スクリプト
│   └── utils/
│       ├── override-versions.ts  # patched_versions の比較ロジック
│       └── release-age-exclude.ts # minimumReleaseAgeExclude の更新ロジック
├── .github/workflows/
│   ├── resolve-audit.yml         # 毎日実行の同期ワークフロー
│   └── audit.yml                 # push 時の脆弱性チェック
├── pnpm-workspace.yaml           # minimumReleaseAge: 10080（7日）
└── renovate.json
```

## セットアップ

```bash
pnpm install
```

## override 自動同期の実行

```bash
pnpm tsx scripts/resolve-audit.ts
```

pnpm store のキャッシュが残っていると `minimumReleaseAge` がバイパスされる場合があります。クリーンな状態で試すには事前に `pnpm store prune` を実行してください。

## テスト

```bash
pnpm test:scripts
```

# pnpm-override-sync-example

`pnpm audit` の結果に基づいて `pnpm-workspace.yaml` の `overrides` と `minimumReleaseAgeExclude` を毎日ゼロベースで再計算し、自動同期する仕組みのサンプルリポジトリです。

> このリポジトリは記事の説明用に作成した架空のプロジェクトです。実際のプロダクトではありません。

## 記事

[脆弱性対応と minimumReleaseAge を両立しながら依存管理をクリーンに保つ](https://zenn.dev/pksha/articles/audit-override-auto-sync)

## 構成

```
├── packages/
│   ├── web/                        # Vite + React + TypeScript（フロントエンド）
│   └── api/                        # Hono + Prisma（バックエンド）
├── scripts/
│   ├── resolve-audit.ts            # override 自動同期スクリプト
│   └── utils/
│       ├── override-pnpm-workspace.ts      # pnpm-workspace.yaml の overrides 操作
│       ├── override-pnpm-workspace.test.ts
│       ├── override-versions.ts            # patched_versions の比較ロジック
│       ├── override-versions.test.ts
│       ├── release-age-exclude.ts          # minimumReleaseAgeExclude の更新ロジック
│       ├── release-age-exclude.test.ts
│       ├── retry-with-release-age.ts       # minimumReleaseAge エラーのリトライ
│       └── retry-with-release-age.test.ts
├── .github/workflows/
│   ├── resolve-audit.yml           # 毎日 UTC 0:00 実行の同期ワークフロー
│   └── audit.yml                   # push / PR 時の脆弱性チェック
├── pnpm-workspace.yaml             # minimumReleaseAge: 10080（7日）
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

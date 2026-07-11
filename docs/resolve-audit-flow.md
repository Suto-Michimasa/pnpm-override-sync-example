# resolve-audit.ts フロー

## 全体フロー

```mermaid
flowchart TD
    A[既存の overrides を全て外す] --> B[override 対象パッケージの依存を更新]
    B --> B1{minimumReleaseAge で失敗?}
    B1 -->|Yes| B2[対象パッケージを minimumReleaseAgeExclude に追加してリトライ]
    B2 --> B1
    B1 -->|No| C[pnpm audit --json で脆弱性を検出]
    C --> D{override を1つずつ install 試行}
    D -->|成功| F{全 override を処理した?}
    D -->|minimumReleaseAge で失敗| E[minimumReleaseAgeExclude に追加してリトライ]
    E -->|成功| F
    E -->|失敗| G[スキップ] --> F
    F -->|No| D
    F -->|Yes| H[package.json と pnpm-workspace.yaml を更新して pnpm install]
    H --> I[差分があれば PR を作成]

    classDef prep fill:#E6F1FB,stroke:#85B7EB,color:#0C447C
    classDef loop fill:#FAEEDA,stroke:#FAC775,color:#633806
    classDef output fill:#EEEDFE,stroke:#AFA9EC,color:#3C3489

    class A,B,B1,B2,C prep
    class D,E,F,G loop
    class H,I output
```

## 今回の修正箇所

記事のフローでは `override 対象パッケージの依存を更新`（`pnpm update`）のステップにエラーハンドリングがなかった。
`pnpm update` は指定パッケージだけでなく lockfile 全体を再解決するため、
override 対象外の transitive 依存（例: `recharts` -> `lodash`）が `minimumReleaseAge` に引っかかるとエラーになる。

Phase 4（個別試行）には既にリトライロジックがあったが、Phase 1（依存更新）にはなかったため追加した。

```mermaid
flowchart LR
    subgraph "修正前"
        A["pnpm update 失敗"] --> B["即エラー終了"]
    end

    subgraph "修正後"
        C["pnpm update 失敗"] --> D{"minimumReleaseAge\nエラー?"}
        D -->|Yes| E["パッケージ名抽出\n(例: lodash)"]
        E --> F["minimumReleaseAgeExclude\nに追加してリトライ"]
        D -->|No| G["エラー終了"]
    end
```

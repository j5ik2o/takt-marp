# 調査・設計判断: slide-workflow-research

## 要約

- **機能**: `slide-workflow-research`
- **ディスカバリー範囲**: 拡張。既存 `plan / compose / polish / deliver` workflow に、任意の前段 `research` command を追加する。
- **主要な発見**:
  - 既存 runner は command list、state、approval、prerequisite、report sync、force invalidation を `plan / compose / polish / deliver` 前提で分散管理している。
  - TAKT package には built-in `deep-research` workflow と `research-report.md` output contract があり、web 調査の persona/policy/loop を repo-local に再実装する必要はない。
  - `research` は既存 `review/` state ではなく `slides/<deck>/research/` 配下の独立 artifact domain として扱う必要がある。

## 調査ログ

### 既存 workflow runner の command 境界

- **背景**: `research` を `plan` の前に単純追加すると、既存 command invalidation の意味が変わる可能性がある。
- **参照した情報源**: `scripts/lib/takt-marp-slide-workflow.mjs`, `scripts/takt-marp-run-slide-workflow.mjs`, `scripts/lib/takt-marp-cli.mjs`
- **発見**:
  - `COMMANDS = ["plan", "compose", "polish", "deliver"]` と `COMMAND_STATES` が固定定義である。
  - `downstreamCommands(command)` は `COMMANDS.indexOf(command)` から後続 command を返す。
  - runner は `slides/<deck>/review/` に report を同期し、source artifact は `plan` のみ deck root に同期する。
- **含意**:
  - `research` を `COMMANDS` 先頭へ単純追加すると `research --force` が plan 以降を退避する危険がある。
  - command metadata は registry 化し、`research` の invalidation scope と artifact domain を個別に定義する。

### TAKT built-in deep research の採用可能性

- **背景**: ユーザーは built-in workflow をできるだけ活かし、車輪の再発明を避ける方針を明示した。
- **参照した情報源**: `node_modules/takt/builtins/ja/workflows/deep-research.yaml`, `node_modules/takt/builtins/ja/facets/output-contracts/research-report.md`, `node_modules/takt/builtins/ja/facets/policies/research.md`, `node_modules/takt/builtins/ja/workflows/default.yaml`
- **発見**:
  - built-in `deep-research` は `plan -> dig -> analyze -> supervise` の探索型 loop を持つ。
  - codex/opencode では `network_access: true` が定義されている。
  - built-in output contract は `research-report.md` を正本として要求する。
  - built-in research policy は事実、推測、未調査事項、URL、統計名、調査年度の明示を求める。
  - built-in workflow 同士は `kind: workflow_call` と `call: default-draft` のように名前で呼び出せる。
- **含意**:
  - repo-local に research persona、research policy、research report contract を fork しない。
  - `takt-marp-slide-research.yaml` は `call: deep-research` の薄い wrapper とし、deck-local artifact への adapter だけを追加する。
  - web 調査許可は built-in research workflow 内に閉じ、通常 slide generation へ広げない。

### template 解決と配布面

- **背景**: `takt-marp-global-installer` 以後、通常実行は package-bundled template を利用し、project-local `.takt` を必須にしない方針である。
- **参照した情報源**: `scripts/lib/takt-marp-project-templates.mjs`, `scripts/takt-marp-sync-project-templates.mjs`, `templates/project/workflows/**`
- **発見**:
  - CLI workflow command は template resolver で package-bundled または ejected workflow path を選べる。
  - ejected templates は `templates/project/workflows/**` と `templates/project/facets/**` から同期される。
  - validation は foundation/smoke scripts と template sync/check scripts に分散している。
- **含意**:
  - research wrapper と adapter facet は `.takt/**` と `templates/project/**` の同期対象に追加する。
  - smoke/foundation validation は CLI help だけでなく runner behavior と bundled/ejected template path を検証する。

## アーキテクチャパターン評価

| 選択肢 | 説明 | 強み | リスク／制約 | メモ |
|--------|------|------|--------------|------|
| `research` を既存 `COMMANDS` に単純追加 | command list の先頭に `research` を追加する | 変更が小さい | `downstreamCommands` により既存 state を壊す | 棄却 |
| command metadata registry | command ごとに state、artifact domain、approval、invalidation scope を持つ | 既存挙動を保ちながら research を分離できる | 初回の置換範囲がやや広い | 採用 |
| repo-local deep research fork | `.takt/facets/**` に deep research 相当を複製する | 完全制御できる | built-in との drift、保守増、車輪の再発明 | 棄却 |
| built-in workflow call + adapter | repo-local workflow は built-in `deep-research` を呼び、deck-local artifact 整形だけを行う | built-in を最大利用し、必要最小の slide workflow 接続だけを持てる | built-in report から派生成果物を抽出する adapter が必要 | 採用 |

## 設計判断

### 判断: `research` は built-in `deep-research` を正本にする

- **背景**: research の探索、web access、persona、policy は TAKT built-in が既に提供している。
- **検討した代替案**:
  1. repo-local research workflow を全実装する — 既存 built-in と重複し、保守 drift が起きる。
  2. built-in `deep-research` を直接 `takt-marp research` から呼ぶ — deck-local artifact sync や supervision state が slide workflow と接続しにくい。
  3. built-in workflow call + adapter — built-in を使い、slide workflow 固有の artifact 境界だけを補う。
- **採用したアプローチ**: `takt-marp-slide-research.yaml` は `kind: workflow_call` で `deep-research` を呼び、後続の adapter step が `research-report.md` から `research-sources.md`、`research-claims.md`、`open-questions.md`、`research-supervision.md` を生成する。
- **根拠**: 研究行為そのものを再実装せず、requirements が求める deck-local artifact だけを満たせる。
- **トレードオフ**: adapter は built-in report の構成に依存する。report layout 変更は validation で早期検知する。
- **フォローアップ**: adapter instruction は「調査を追加しない」「built-in report だけから派生する」ことを明記する。

### 判断: `research` は独立 artifact domain とする

- **背景**: research 成果物は plan の任意入力であり、review/approval state とは性質が違う。
- **採用したアプローチ**: `slides/<deck>/research/` を research domain とし、`research-supervision.md` も同 domain に置く。
- **根拠**: 既存 review artifacts と混ざらず、plan は任意の追加 context として参照できる。
- **フォローアップ**: rejected/force の退避先も `research/history/` に限定することを validation で確認する。

### 判断: command behavior は registry から派生させる

- **背景**: 既存 command constants は分散しており、research の特殊性を if 文だけで足すと保守しづらい。
- **採用したアプローチ**: `CommandConfigRegistry` を導入し、state、artifactDomain、approvalSupported、invalidationTargets、sourceArtifacts を定義する。
- **根拠**: 既存 command の意味を保持しながら、research だけ `invalidationTargets: ["research"]` にできる。
- **フォローアップ**: `COMMANDS`、`COMMAND_STATES`、`APPROVAL_COMMANDS` は外部互換のため export を維持する。

### 判断: plan は research を必須にしない

- **背景**: research は deepresearch 系 workflow として独立させるが、すべての deck で必須ではない。
- **採用したアプローチ**: `brief.md` を primary input のまま維持し、research artifacts は optional context とする。
- **根拠**: 既存 workflow の軽さを維持し、調査不要な deck を壊さない。
- **フォローアップ**: `reference-analysis.md` または `plan.md` に research 由来を識別できる記述を要求する。

## リスクと緩和策

- built-in `deep-research` の report layout が想定と違う — adapter は `research-report.md` の存在検証を先に実装し、不足時は明示エラーにする。
- `research --force` が既存 plan artifacts を壊す — registry の `invalidationTargets` を validation で固定し、research domain 以外を archive しないことをテストする。
- plan が research 未実行 deck を誤って失敗させる — prerequisite test と smoke で `brief.md` only path を残す。
- repo-local adapter が研究内容を再評価し始める — adapter instruction と review で、派生元を built-in report に限定する。

## 参考資料

- `scripts/lib/takt-marp-slide-workflow.mjs` — command/state/approval/report helper の現状。
- `scripts/takt-marp-run-slide-workflow.mjs` — TAKT 起動と report/source artifact sync の現状。
- `scripts/lib/takt-marp-project-templates.mjs` — bundled/ejected template 解決。
- `node_modules/takt/builtins/ja/workflows/deep-research.yaml` — 採用する built-in research workflow。
- `node_modules/takt/builtins/ja/facets/output-contracts/research-report.md` — built-in research report contract。
- `.kiro/steering/roadmap.md` — canonical slide workflow と global installer 方針。

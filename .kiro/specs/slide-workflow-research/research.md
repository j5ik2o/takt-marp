# 調査・設計判断: slide-workflow-research

## 要約

- **機能**: `slide-workflow-research`
- **ディスカバリー範囲**: 拡張。既存 `research` command に、失敗後の Research Source Report Reuse（調査元レポート再利用）を追加する。
- **主要な発見**:
  - 既存 runner は command list、state、approval、prerequisite、report sync、force invalidation を `plan / compose / polish / deliver` 前提で分散管理している。
  - TAKT package には built-in `deep-research` workflow と `research-report.md` output contract があり、web 調査の persona/policy/loop を repo-local に再実装する必要はない。
  - `research` は既存 `review/` state ではなく `slides/<deck>/research/` 配下の独立 artifact domain として扱う必要がある。
  - 現行 runner は TAKT が非 0 終了した場合に deck-local artifact sync を行わないため、deep research 完了後の adapter/supervision 失敗では built-in `research-report.md` が `.takt/runs/**/reports` に残るだけになる。

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

### 失敗 run と再利用候補の同定

- **背景**: deep research 完了後に adapter や supervision だけが失敗した場合、次回 `research` で同じ外部調査を繰り返さないために、失敗 run の built-in `research-report.md` を安全に再利用したい。
- **参照した情報源**: `scripts/takt-marp-run-slide-workflow.mjs`, `.takt/runs/*/meta.json`, `.takt/runs/*/reports/subworkflows/**/research-report.md`, `docs/adr/0002-reuse-research-source-report-after-failed-run.md`
- **発見**:
  - `runTakt` が非 0 を返すと runner は `syncResearchArtifactsToDeck` を実行せず、そのまま終了する。
  - TAKT run の `meta.json` には `workflow`、`task`、`runSlug`、`reportDirectory`、`status`、`updatedAt` があり、`research` では `task` が `slides/<deck>/research/research-brief.md` になる。
  - bundled template 実行では runner が `-w` に workflow file path を渡しうるため、`meta.json.workflow` は workflow 名だけとは限らない。
  - built-in deep research report は selected reports directory の `subworkflows/**/workflow-deep-research/**/research-report.md` に存在することを既存 Research Source Report Locator の優先条件にできる。
  - `research-brief.md` の内容一致は TAKT meta だけでは判定できないため、takt-marp 側で brief hash を保存する Research Reuse Sidecar（調査再利用サイドカー）が必要である。
  - Research Reuse Workflow は public command として登録せず、selected Research Workflow Wrapper と同じ `workflows` directory の sibling path として導出するのが既存 resolver と最も整合する。
- **含意**:
  - runner は research 実行前後で `.takt/runs` の snapshot を取り、非 0 終了時に Workflow Identity を正規化したうえで今回更新された `takt-marp-slide-research` run だけから reusable report を探す。
  - 再利用候補は Research Reuse Sidecar として `.takt/research-reuse/*.json` に保存し、target、brief hash、source run、source report path を照合してから使う。
  - `--force` は reuse を無効化し、古い Research Reuse Sidecar を破棄して full research を実行する。
  - bundled/ejected のどちらでも、Research Reuse Workflow は selected Research Workflow Wrapper の sibling として検証し、`research-reuse` のような public command は追加しない。

## アーキテクチャパターン評価

| 選択肢 | 説明 | 強み | リスク／制約 | メモ |
|--------|------|------|--------------|------|
| `research` を既存 `COMMANDS` に単純追加 | command list の先頭に `research` を追加する | 変更が小さい | `downstreamCommands` により既存 state を壊す | 棄却 |
| Command Config Registry | command ごとに state、artifact domain、approval、invalidation scope を持つ | 既存挙動を保ちながら research を分離できる | 初回の置換範囲がやや広い | 採用 |
| repo-local deep research fork | `.takt/facets/**` に deep research 相当を複製する | 完全制御できる | built-in との drift、保守増、車輪の再発明 | 棄却 |
| built-in workflow call + adapter | repo-local workflow は built-in `deep-research` を呼び、deck-local artifact 整形だけを行う | built-in を最大利用し、必要最小の slide workflow 接続だけを持てる | built-in report から派生成果物を抽出する adapter が必要 | 採用 |
| TAKT runtime の resume 機能 | TAKT の resume point から失敗 step 以降を再開する | runtime が正しく扱えれば自然 | CLI surface と runtime 内部状態への依存が強く、slide workflow 側で安全条件を検証しにくい | 棄却 |
| 既存 research workflow 分岐 | `takt-marp-slide-research.yaml` に reuse 分岐を追加する | workflow ファイル数を増やさない | full research と reuse の責務が混ざり、`deep_research` skip を静的検証しづらい | 棄却 |
| Research Reuse Workflow | private workflow で adapter/supervision だけを実行する | deep research を呼ばないことを固定しやすく、blast radius が小さい | private template と runner 選択ロジックが必要 | 採用 |

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

### 判断: 失敗後の再実行は Research Reuse Sidecar と Research Reuse Workflow で扱う

- **背景**: built-in `deep-research` が完了した後に adapter/supervision で失敗すると、同じ外部調査の再実行が高コストになる。
- **検討した代替案**:
  1. TAKT runtime の resume 機能を使う — runtime 内部状態への依存が強く、brief hash や target 一致を slide workflow 側で保証しづらい。
  2. 既存 research workflow に skip 分岐を入れる — wrapper が full research と reuse の両方を持ち、static validation が弱くなる。
  3. Research Reuse Sidecar + Research Reuse Workflow — runner が安全条件を判定し、workflow は後続 artifact 生成だけを担当する。
- **採用したアプローチ**: 非 0 終了後に runner が reusable built-in `research-report.md` を検出できた場合だけ Research Reuse Sidecar を作る。次回 `research` は Research Reuse Sidecar の target と `research-brief.md` hash を照合し、deck-local `research-report.md` へ byte-for-byte copy してから Research Reuse Workflow を実行する。
- **根拠**: 再利用の安全条件を runner 側で明示でき、TAKT runtime の resume 機能に依存せず、通常の Research Workflow Wrapper に条件分岐を足さずに済む。
- **トレードオフ**: Research Reuse Workflow template と Research Reuse Sidecar lifecycle を追加する必要がある。古い Research Reuse Sidecar や missing source report は通常 full research に戻す。
- **フォローアップ**: foundation validation で hash mismatch、candidate ambiguity、`--force` bypass、successful cleanup、Research Reuse Workflow が `deep_research` を呼ばないことを固定する。

## リスクと緩和策

- built-in `deep-research` の report layout が想定と違う — adapter は `research-report.md` の存在検証を先に実装し、不足時は明示エラーにする。
- `research --force` が既存 plan artifacts を壊す — registry の `invalidationTargets` を validation で固定し、research domain 以外を archive しないことをテストする。
- plan が research 未実行 deck を誤って失敗させる — prerequisite test と smoke で `brief.md` only path を残す。
- repo-local adapter が研究内容を再評価し始める — adapter instruction と review で、派生元を built-in report に限定する。
- stale Research Reuse Sidecar が古い調査元レポートを再利用する — target と `research-brief.md` hash が一致しない場合は reuse せず、successful state 到達時に Research Reuse Sidecar を削除する。
- Research Reuse Workflow が誤って deep research を再実行する — static validation で `workflow_call deep-research` が存在しないことを確認する。

## 参考資料

- `scripts/lib/takt-marp-slide-workflow.mjs` — command/state/approval/report helper の現状。
- `scripts/takt-marp-run-slide-workflow.mjs` — TAKT 起動と report/source artifact sync の現状。
- `scripts/lib/takt-marp-project-templates.mjs` — bundled/ejected template 解決。
- `node_modules/takt/builtins/ja/workflows/deep-research.yaml` — 採用する built-in research workflow。
- `node_modules/takt/builtins/ja/facets/output-contracts/research-report.md` — built-in research report contract。
- `.kiro/steering/roadmap.md` — canonical slide workflow と global installer 方針。
- `docs/adr/0002-reuse-research-source-report-after-failed-run.md` — Research Source Report Reuse の設計判断。

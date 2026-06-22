# ロードマップ

## 概要

Marpスライド生成workflowを、TAKTの閉じた品質ループに合わせて再設計する。ユーザーが実行するトップレベルコマンドは `plan / compose / polish / deliver` に絞り、`review`、`revise`、`qa`、`build-qa` は独立コマンドではなく、各workflow内部の責務として扱う。

このロードマップは `docs/marp-slide-workflow-redesign/` の3文書をもとに作成した。実装は破壊的変更として進め、旧コマンドや旧workflowの互換エイリアスは残さない。

## アプローチ決定

- **採用**: 依存順に分けるmulti-spec構成
- **理由**: 状態検証とapprovalの土台、TAKT workflow/facet再編、smoke実行検証は責務と変更リスクが異なる。1つのspecにまとめるとタスク数が増えすぎ、review範囲も曖昧になるため、まず決定論的なCLI/状態管理を固め、その上でworkflow本体を置き換え、最後に実行で収束させる。
- **棄却した案**:
  - 単一巨大spec: scripts、workflow YAML、facets、render evidence、smoke runが混在し、設計境界が曖昧になる。
  - specなしの直接実装: command/state modelとreport/approval contractを変えるため、判断履歴と継続性が弱い。
  - 互換維持移行: ユーザー専用ツールで本質的改善を優先するため、旧コマンド互換は残さない。

## スコープ

- **In**:
  - `plan / compose / polish / deliver` のcommand/state model
  - `slides/<deck>` target contract
  - 決定論的な状態検証、approval生成、workflow runner
  - YAML front matterベースのreport schema
  - stable finding modelとloop monitor contract
  - 4つのcanonical TAKT workflow
  - 利用可能なbuilt-in facetの `extends`
  - smoke deck実行と収束修正
- **Out**:
  - `draft`、`review-revise`、`build-qa`、top-level `qa` の互換エイリアス
  - TAKT agentによるgit操作
  - TAKT agentによるapproval file生成
  - `slides/<deck>` 以外の任意入力path
  - full YAML parser依存の追加
  - `polish` におけるPPTX目視検査

## 制約

- プロジェクト内のspec/設計文書は日本語で書く。
- workflow実行は常に `--skip-git` を使う。
- `takt-marp-run-slide-workflow.mjs` は `./node_modules/.bin/takt` を直接呼ぶ。
- `takt-marp-global-installer` では上記 runner executable 解決を置き換え、`projectRoot` と `packageRoot/runtimeBin` を分離して target project の `node_modules` を要求しない。
- approvalは人間の意思決定記録であり、TAKT workflow agentは読むだけにする。
- `plan` と `compose` は人間承認を要求できるが、承認待ちはTAKT workflow失敗として扱わない。
- `polish` と `deliver` には通常のapproval fileを置かない。
- 状態確認はfront matterをparseして行い、ファイル存在や曖昧なgrepだけでは通さない。
- front matter parserのためだけに新規依存を追加しない。
- generated evidence/artifactsはcleanしてよいが、source artifactsはforce invalidationで自動削除しない。
- `plan.md` が delivery artifact request のownerであり、`deliverables: [html|pdf|pptx]` を `deliver` が読む。
- supervision/finding report は `target`、`generated_at`、`workflow_run_id` を含むfront matterで freshness を判定する。Loop monitoring は deck-local report ではなく TAKT `loop_monitors` で扱う。approval file は `target`、`approved_at`、`supervision_workflow_run_id` を持ち、approval自体の `generated_at` と `workflow_run_id` は要求しない。stale 判定の主キーは approval の `supervision_workflow_run_id` と canonical supervision の `workflow_run_id` の一致である。
- 通常の `deliver` 実行では orchestration の `build_delivery` step が export 前に `dist/<deck>/` を clean する。
- smoke validation は integration fix exception として upstream owned files を最小修正できるが、command/state model、approval ownership、deliverable enum は再定義しない。

## 境界戦略

- **分割理由**: `slide-workflow-foundation` が決定論的なcommand/state/approval mechanicsを提供し、後続workflowの土台になる。`slide-workflow-orchestration` はTAKT YAMLとfacet設計に集中する。`slide-workflow-smoke-validation` は両者を統合してend-to-endで検証する。
- **注意する共有境界**:
  - report front matter schemaはscriptsとTAKT output contractsで一致させる
  - approval fileは人間作成であり、TAKT workflowは生成しない
  - `polish` のrender evidenceと `deliver` のofficial artifactを分離する
  - force invalidationはreportsをarchiveし、source artifactsは保持する
  - old workflow名は実行面から除去し、docsでは廃止対象としてだけ言及する

## Specs (dependency order)

- [x] slide-workflow-foundation -- command/state model、report schema docs、決定論的helper scripts、approval script、workflow runner、npm entrypointを整備する。Dependencies: none
- [x] slide-workflow-orchestration -- 4つのcanonical TAKT workflow、facet/output-contract再編、built-in `extends` 適用、旧workflow削除を行う。Dependencies: slide-workflow-foundation
- [x] slide-workflow-smoke-validation -- end-to-end smoke run、invalid target/rerun/force検証、render evidence検証、収束修正を行う。Dependencies: slide-workflow-foundation, slide-workflow-orchestration

## Follow-up Specs (dependency order)

- [x] slide-workflow-ai-quality-gate -- 4つのcanonical workflowすべてに、通常review/inspect/verify前のcallable AI antipattern quality gateを追加する。Dependencies: slide-workflow-foundation, slide-workflow-orchestration, slide-workflow-smoke-validation
- [x] takt-marp-global-installer -- `npm install -g` で `takt-marp` commandを導入し、slide workflowの主要操作をグローバルCLIから実行できるようにする。Dependencies: slide-workflow-foundation, slide-workflow-orchestration, slide-workflow-smoke-validation

## Quality Uplift Specs (dependency order)

takt-sdd deck の実運用で判明したギャップへの対応。workflow 産出物を人手+対話で大幅修正(+575/-227 等)した差分分析から、修正の大半が「facets が定義していない・禁止している・知覚できない」品質次元であることが判明した(`slides/takt-sdd/SLIDES.md` の git 履歴と facets カバレッジ分析に基づく)。

- [x] slide-workflow-quality-uplift -- facets/policy/output contract の品質定義を実証済み水準へ引き上げる: layout 語彙の開放(infographic/code-2col/profile 等の正式採用と compose の拡張権限)、inline SVG のガードレール付き許可への policy 反転、speaker notes の尺配分契約、brief 正規化の必須項目追加(イベント・登壇者・事実インベントリ)、review の先鋭度/密度基準。Dependencies: slide-workflow-orchestration, slide-workflow-ai-quality-gate
- [ ] slide-workflow-visual-review -- polish の render evidence cycle に multimodal visual review step を追加し、render 済み PNG を reviewer persona が知覚して findings → fix → 再 render の閉ループで視覚品質を判定する。Dependencies: slide-workflow-quality-uplift

## Design Contract Specs (dependency order)

`compose` が毎回 `design-system.md` を生成する現行形では、デザインシステムが資料ごとの一時成果物になり、再利用される Design Contract（デザイン契約）として扱いにくい。Claude Design Source（Claude Designソース）を唯一の user-facing design system 入力とし、workflow は内部の Resolved Design Contract（解決済みデザイン契約）へ正規化する。`plan` は CSS を生成せず source metadata と制約だけを記録し、`compose` が同じ Resolved Design Contract から CSS / `_class` / section HTML/CSS を生成する。
Design Brief（デザインブリーフ）は Claude Design Source を作るための authoring input として `slides/<deck>/design/design-brief.md` に残すが、Design Contract の代替入力にはしない。

- [x] slide-workflow-design-contract -- Claude Design zip を Design Contract へ正規化し、Resolved Design Contract を `plan` / `compose` / review / smoke validation に接続する。手書き `design-contract.md`、package default design input、deck-local Markdown override は初期 scope に含めない。Dependencies: slide-workflow-orchestration, slide-workflow-quality-uplift, takt-marp-global-installer

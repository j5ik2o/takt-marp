# MarpスライドWorkflow再設計 タスク

## 実装戦略

再設計は3段階で進める。

1. ドキュメントとscript土台
2. Workflowとfacetの再構成
3. Smoke runと収束修正

破壊的変更として扱う。旧コマンドの互換エイリアスは残さない。

## Task 1: ドキュメントとScript土台

### 目的

TAKT workflow YAMLを書き換える前に、command/state contract、report schema、決定論的state validation、approval generation、wrapper executionを整備する。

### 手順

1. Workflow command/state modelのADRを追加する。
   - `docs/adr/` を確認する。
   - 次のADR番号を使う。
   - 既存ADRがなければ `0001` から始める。
   - `review`、`revise`、`qa`、`build-qa` をtop-level commandにしない理由を書く。

2. Workflow docsを更新する。
   - `plan / compose / polish / deliver` を説明する。
   - `slides/<deck>` target contractを書く。
   - old command removalを書く。
   - human approval placementを書く。
   - output directoriesを書く。

3. Report schema docsを追加する。
   - `docs/marp-slide-workflow-reports.md` を作る。
   - YAML front matter base schemaを定義する。
   - supervision schemaを定義する。
   - approval schemaを定義する。approval fileは `approved_at` と `supervision_workflow_run_id` を持ち、approval自体の `generated_at` と `workflow_run_id` は要求しない。
   - loop monitor schemaを定義する。
   - finding modelを定義する。
   - severity、result、failure reason、loop status、next action enumsを定義する。

4. Shared script libraryを追加する。
   - `scripts/lib/takt-marp-slide-workflow.mjs` を作る。
   - `slides/<deck>` target validationを実装する。
   - documented subset用front matter parserを実装する。
   - supervision validationを実装する。
   - approval validationを実装する。
   - report archiving helpersを実装する。
   - generated directory cleanup helpersを実装する。

5. State check scriptを追加する。
   - `scripts/takt-marp-check-slide-workflow-state.mjs` を作る。
   - 次をsupportする。
     - `--require plan:planned:approved`
     - `--require compose:composed:approved`
     - `--require polish:polished`
   - actionable errorを出す。
   - invalid stateではnon-zeroを返す。

6. Approval scriptを追加する。
   - `scripts/takt-marp-approve-slide-workflow-state.mjs` を作る。
   - `plan` と `compose` だけを許可する。
   - `--by` を必須にする。
   - `polish` と `deliver` を拒否する。
   - approval作成前にmatching supervision reportを検証する。
   - `--force` なしの上書きを拒否する。
   - `target`、`approved_at`、`supervision_workflow_run_id`、`waivers: []`、`decisions: []` を持つYAML front matterを生成する。

7. Workflow runner scriptを追加する。
   - `scripts/takt-marp-run-slide-workflow.mjs` を作る。
   - commandは `plan`、`compose`、`polish`、`deliver` を受け付ける。
   - targetは `slides/<deck>` を受け付ける。
   - TAKT起動前にprerequisitesを検証する。
   - `.takt/workflows/takt-marp-slide-{command}.yaml` が存在しない場合はTAKTを起動せず、未実装workflowとexpected pathを示すerrorで失敗する。
   - successful stateのrerunを `--force` なしでは拒否する。
   - rejected command reportsはrerun前にarchiveする。
   - `--force` ではTAKT起動前にcommand/downstream reports/approvalsをarchiveする。
   - 必要に応じてstale `dist/<deck>/` と `.takt/render/<deck>/` を削除する。
   - `./node_modules/.bin/takt --pipeline --skip-git` をspawnする。

8. Render evidence scriptを追加する。
   - `scripts/takt-marp-render-slide-workflow-evidence.mjs` を作る。
   - Marp CLI image outputでPNG evidenceを生成する。
   - preview server startupを確認する。
   - PDFを生成する。
   - `pdftoppm` があればPDFをrasterizeする。
   - `.takt/render/<deck>/cycle-{n}/metadata.json` を書く。
   - preview serverを確実に止める。

9. npm scriptsを更新する。
   - direct TAKT command scriptsをwrapper scriptsへ置き換える。
   - `slide:check-state` を追加する。
   - `slide:approve` を追加する。
   - old top-level scriptsを削除する。
     - `slide:draft`
     - `slide:review-revise`
     - `slide:build-qa`

### 受け入れ条件

- `npm run slide:check-state -- "slides/my-talk" --require plan:planned:approved` はapproval missing時にactionable messageで失敗する。
- `npm run slide:approve -- "slides/my-talk" plan --by j5ik2o` は `plan-supervision.md` がmissingまたはpassedでない場合に失敗する。
- `npm run slide:approve -- "slides/my-talk" polish --by j5ik2o` は失敗する。
- `npm run slide:plan -- "slides/my-talk"` はTAKT起動前にtargetを検証する。
- `npm run slide:plan -- "slides/my-talk/brief.md"` はTAKT起動前に失敗する。
- Front matter parserのために新規package dependencyを追加しない。

## Task 2: WorkflowとFacetの再構成

### 目的

現行の非MECE workflow setを、各commandがreview/fix/monitor/superviseを内部で閉じる4つのcommand workflowへ置き換える。

### 手順

1. `takt-marp-slide-plan` を再構築する。
   - workflow名は維持する。
   - targetを `slides/<deck>` にする。
   - `brief.md` を要求する。
   - `brief.normalized.md` を生成する。
   - `plan.md` を生成する。
   - `review_plan` を追加する。
   - `fix_plan` を追加する。
   - TAKT `loop_monitors` で plan review/fix cycle を監視する。
   - `supervise_plan` を追加する。
   - `review/plan-supervision.md` を出す。
   - approval fileは出さない。

2. Draft workflowをcompose workflowへ置き換える。
   - `takt-marp-slide-draft.yaml` を削除する。
   - `takt-marp-slide-compose.yaml` を追加する。
   - targetを `slides/<deck>` にする。
   - plan supervisionとapprovalを要求する。
   - `design-system.md` を生成する。
   - `SLIDES.md` を生成する。
   - `images/*.svg` を生成する。
   - parallel composition reviewを追加する。
     - `review_content`
     - `review_flow`
     - `review_visual`
     - `review_assertion`
   - `aggregate_composition_findings` を追加する。
   - `fix_composition` を追加する。
   - TAKT `loop_monitors` で compose review/fix cycle を監視する。
   - `supervise_composition` を追加する。
   - `review/compose-supervision.md` を出す。
   - approval fileは出さない。

3. Review-revise workflowを削除する。
   - `takt-marp-slide-review-revise.yaml` を削除する。
   - 有用なreview観点はcompose内部review loopへ移す。
   - aliasは残さない。

4. Build-qaをpolishとdeliverへ分割する。
   - `takt-marp-slide-build-qa.yaml` を削除する。
   - `takt-marp-slide-polish.yaml` を追加する。
   - `takt-marp-slide-deliver.yaml` を追加する。
   - aliasは残さない。

5. Polish workflowを実装する。
   - targetを `slides/<deck>` にする。
   - compose supervisionとapprovalを要求する。
   - render evidence scriptを実行する。
   - HTML PNG evidenceをinspectする。
   - 可能ならPDF raster evidenceをinspectする。
   - `pdftoppm` missingはminor degraded modeにする。
   - HTML PNG generation failureはblockerにする。
   - preview server startup failureはmajorにする。
   - PDF generation failureはmajorにする。
   - visual/layout/render/design-token issuesだけをrepairする。
   - TAKT `loop_monitors` で polish inspect/repair cycle を監視する。
   - `supervise_polish` を追加する。
   - `review/polish-supervision.md` を出す。

6. Deliver workflowを実装する。
   - targetを `slides/<deck>` にする。
   - polish supervisionを要求する。
   - `plan.md` からdeliverablesを読む。
   - export前に `dist/<deck>/` をcleanする。
   - `plan.md` のdeliverablesだけを生成する。
   - HTML/PDF/PPTX readabilityを検証する。
   - unsupported deliverablesはblockerにする。
   - `fix_export` を追加する。
   - TAKT `loop_monitors` で deliver verify/fix cycle を監視する。
   - `supervise_deliver` を追加する。
   - `review/deliver-supervision.md` を出す。

7. Output contractsをrename/consolidateする。
   - generic report contracts:
     - `slide-finding-report.md`
     - `slide-fix-report.md`
     - `slide-supervision-report.md`
     - `slide-approval.md`
   - Marp-specific artifact contracts:
     - `takt-marp-slide-plan.md`
     - `takt-marp-design-system.md`

8. Policiesを整理する。
   - `takt-marp-general-slide-quality` を追加する。
   - `takt-marp-slide-quality` を維持する。
   - `takt-marp-svg-first-visual` を維持する。
   - `takt-marp-worker-boundary` を維持する。
   - 可能なら次を使う。
     - `takt-marp-general-slide-quality extends design-fidelity`
     - `takt-marp-slide-quality extends takt-marp-general-slide-quality`
   - local-to-local extendsが非対応なら `takt-marp-slide-quality extends design-fidelity` にfallbackする。

9. Missing personasを追加する。
   - `takt-marp-slide-supervisor`
   - 既存slide personasは適切に維持する。

10. 可能な箇所でbuilt-in facetsを `extends` して使う。
    - 汎用mechanicsではbuilt-in `plan`、`fix`、`supervise` を優先し、loop monitoring は TAKT `loop_monitors` で built-in instruction を参照する。
    - local facetsはMarp固有の薄い差分にする。

11. 命名を正規化する。
    - workflow step namesはsnake_case。
    - report filenamesはkebab-case。
    - canonical reportsは `{command}-{role}.md`。

### 受け入れ条件

- canonical workflow filesは次の4つだけ。
  - `takt-marp-slide-plan.yaml`
  - `takt-marp-slide-compose.yaml`
  - `takt-marp-slide-polish.yaml`
  - `takt-marp-slide-deliver.yaml`
- old workflow filesは削除されている。
- `review` と `revise` はuser-facing commandではない。
- `qa` はtop-level workflow名やnpm command名に使われていない。
- 各workflowにsupervision stepがある。
- fixable workflow loopには独立loop monitor stepがある。
- 各reportにYAML front matterとMarkdown bodyがある。
- `plan` と `compose` はapproval fileを作らずに完了する。

## Task 3: Smoke実行と収束修正

### 目的

再設計workflowをsmoke deckでend-to-end実行し、command sequenceが `delivered` に到達するまでworkflow、report、script、facetの不備を修正する。

### 手順

1. Smoke deckを準備する。
   - fixtureを `slides/<deck>` として使えるようにする。
   - deck directoryに `brief.md` があることを確認する。
   - command targetに `slides/<deck>/brief.md` を使わない。

2. planを実行する。
   ```bash
   npm run slide:plan -- "slides/<deck>"
   ```
   - `brief.normalized.md`
   - `plan.md`
   - `review/plan-review.md`
   - `review/plan-supervision.md`
   - `plan-supervision.md` に `command: plan`、`state: planned`、`result: passed`、`approval_required: true` があること

3. planを承認する。
   ```bash
   npm run slide:approve -- "slides/<deck>" plan --by j5ik2o
   ```
   - `review/plan-approval.md`
   - `status: approved`
   - `approved_by: j5ik2o`
   - timezone付き `approved_at`

4. composeを実行する。
   ```bash
   npm run slide:compose -- "slides/<deck>"
   ```
   - `design-system.md`
   - `SLIDES.md`
   - `images/*.svg`
   - `review/compose-review.md`
   - `review/compose-supervision.md`
   - TAKTがapproval fileを生成していないこと

5. composeを承認する。
   ```bash
   npm run slide:approve -- "slides/<deck>" compose --by j5ik2o
   ```
   - `review/compose-approval.md`
   - `status: approved`

6. polishを実行する。
   ```bash
   npm run slide:polish -- "slides/<deck>"
   ```
   - `.takt/render/<deck>/cycle-1/metadata.json`
   - HTML PNG evidence
   - 可能ならPDF evidence
   - `review/polish-inspection.md`
   - `review/polish-supervision.md`
   - `polish-supervision.md` に `command: polish`、`state: polished`、`result: passed` があること

7. deliverを実行する。
   ```bash
   npm run slide:deliver -- "slides/<deck>"
   ```
   - `dist/<deck>/`
   - `plan.md` のdeliverablesだけがofficial outputsとして存在すること
   - `review/deliver-verification.md`
   - `review/deliver-supervision.md`
   - `deliver-supervision.md` に `command: deliver`、`state: delivered`、`result: passed` があること

8. invalid target behaviorを検証する。
   - `npm run slide:plan -- "slides/<deck>/brief.md"` はTAKT起動前に失敗する。
   - plan approvalなしの `npm run slide:compose -- "slides/<deck>"` はTAKT起動前に失敗する。

9. rerun behaviorを検証する。
   - successful commandのrerunは `--force` なしで失敗する。
   - rejected commandのrerunは `--force` なしで許可される。
   - `--force` はdownstream reports/approvalsをarchiveする。
   - `--force` はstale generated evidence/deliverablesを削除する。

10. history behaviorを検証する。
    - cycle snapshotsが `review/history/` に出る。
    - force invalidation snapshotsに `force-{command}` とtimestampが入る。
    - rerun after rejected snapshotsに `rerun-after-rejected` とtimestampが入る。

11. Smoke runで見つかった問題を修正する。
    - script bugs
    - workflow routing bugs
    - facet contract mismatches
    - report front matter shape
    - Marp render evidence generation issues

### 受け入れ条件

- canonical smoke sequenceが `delivered` に到達する。
- どのcommandも `slides/<deck>/brief.md` を受け付けない。
- approval fileはTAKT workflowから生成されない。
- missing approvalはTAKT起動前に次commandを止める。
- old commandsが存在しない。
  - `slide:draft`
  - `slide:review-revise`
  - `slide:build-qa`
- old workflow filesが存在しない。
  - `takt-marp-slide-draft.yaml`
  - `takt-marp-slide-review-revise.yaml`
  - `takt-marp-slide-build-qa.yaml`
- `polish` は `.takt/render/<deck>/` にrender evidenceを書く。
- `deliver` は `dist/<deck>/` にofficial artifactsを書く。
- すべてのsupervision reportにcommand、state、result、finding countsを含むfront matterがある。
- failed stateは `state: none` と `result: rejected` で表す。
- documented force/archive behaviorで安全に再実行できる。

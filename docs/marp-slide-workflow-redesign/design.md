# MarpスライドWorkflow再設計 設計

## 概要

再設計後のworkflowは、ユーザー向けcommandとTAKT内部のloop mechanicsを分離する。

ユーザーが実行する命令:

```text
plan -> compose -> polish -> deliver
```

各commandが到達する成果物状態:

```text
planned -> composed -> polished -> delivered
```

各TAKT workflowは自身の品質ループを閉じる。

```text
work -> review/inspect/verify -> fix -> review/inspect/verify -> supervise
```

Fix/review の反復監視は、通常stepではなくTAKT workflow直下の `loop_monitors` で定義する。

`review`、`revise`、`qa`、`build-qa` をトップレベルコマンドとして露出しない。

## Workflowファイル

Canonical workflow files:

```text
.takt/workflows/takt-marp-slide-plan.yaml
.takt/workflows/takt-marp-slide-compose.yaml
.takt/workflows/takt-marp-slide-polish.yaml
.takt/workflows/takt-marp-slide-deliver.yaml
```

削除するworkflow files:

```text
.takt/workflows/takt-marp-slide-draft.yaml
.takt/workflows/takt-marp-slide-review-revise.yaml
.takt/workflows/takt-marp-slide-build-qa.yaml
```

互換aliasは残さない。

## NPMエントリポイント

`package.json` は次を公開する。

```json
{
  "slide:plan": "node scripts/takt-marp-run-slide-workflow.mjs plan",
  "slide:compose": "node scripts/takt-marp-run-slide-workflow.mjs compose",
  "slide:polish": "node scripts/takt-marp-run-slide-workflow.mjs polish",
  "slide:deliver": "node scripts/takt-marp-run-slide-workflow.mjs deliver",
  "slide:check-state": "node scripts/takt-marp-check-slide-workflow-state.mjs",
  "slide:approve": "node scripts/takt-marp-approve-slide-workflow-state.mjs"
}
```

使用例:

```bash
npm run slide:plan -- "slides/my-talk"
npm run slide:approve -- "slides/my-talk" plan --by j5ik2o
npm run slide:compose -- "slides/my-talk"
npm run slide:approve -- "slides/my-talk" compose --by j5ik2o
npm run slide:polish -- "slides/my-talk"
npm run slide:deliver -- "slides/my-talk"
```

## Commandの流れ

### plan

```text
intake
planning
review_plan
fix_plan
review_plan
supervise_plan
```

Rules:

- `planning` は初回だけ実行する。
- `fix_plan` 後の反復は TAKT `loop_monitors` で監視する。
- `review_plan` がpassedの場合だけ `supervise_plan` に進む。
- `supervise_plan` は成功時に `state: planned` と `result: passed` を出す。

Reports:

```text
review/plan-review.md
review/plan-fix.md
review/plan-supervision.md
review/plan-approval.md
```

Artifacts:

```text
brief.normalized.md
plan.md
```

### compose

```text
intake
design_system
compose_slides
compose_visuals
review_composition_parallel
aggregate_composition_findings
fix_composition
review_composition_parallel
aggregate_composition_findings
supervise_composition
```

Parallel review substeps:

```text
review_content
review_flow
review_visual
review_assertion
```

Reports:

```text
review/compose-review-content.md
review/compose-review-flow.md
review/compose-review-visual.md
review/compose-review-assertion.md
review/compose-review.md
review/compose-fix.md
review/compose-supervision.md
review/compose-approval.md
```

Artifacts:

```text
design-system.md
SLIDES.md
images/*.svg
```

`compose` はrender outputを要求しない。静的なsource completenessだけを見る。

### polish

```text
intake
render
inspect_visual
repair_visual
render
inspect_visual
supervise_polish
```

Reports:

```text
review/polish-inspection.md
review/polish-repair.md
review/polish-supervision.md
```

Evidence:

```text
.takt/render/<deck>/cycle-1/
  html/
    slide-001.png
  pdf/
    slide-001.png
  metadata.json
```

`polish` が編集してよいもの:

- `design-system.md`
- `SLIDES.md`
- `images/*.svg`

`polish` はplan-level contentを変更しない。

### deliver

```text
intake
export_artifacts
verify_artifacts
fix_export
export_artifacts
verify_artifacts
supervise_deliver
```

Reports:

```text
review/deliver-verification.md
review/deliver-fix.md
review/deliver-supervision.md
```

Artifacts:

```text
dist/<deck>/
```

`deliver` はartifact correctnessだけを検証する。Visual inspectionは行わない。

## 人間Approval設計

TAKT生成のsupervision reportはapprovalによって変更しない。

人間が作成するapproval file:

```text
review/plan-approval.md
review/compose-approval.md
```

Approval front matter:

```yaml
status: approved
command: plan
target: slides/my-talk
approved_state: planned
supervision_workflow_run_id: 20260605-171000-my-talk-plan
approved_by: j5ik2o
approved_at: 2026-06-05T11:42:00+09:00
waivers: []
decisions: []
```

Approval file は approval 自体の `generated_at` / `workflow_run_id` を持たず、`approved_at` と `supervision_workflow_run_id` によってfreshnessを判定する。

`slide:approve`:

- `plan` と `compose` だけを受け付ける
- `--by` を必須にする
- デフォルトでは上書きしない
- `--force` で明示上書きできる
- approval作成前に対応するsupervision reportを検証する
- waiver CLI optionsは受け付けない

TAKT agentsはapproval scriptsを呼ばず、approval filesを書かない。

## レポートモデル

すべてのworkflow reportsはYAML front matterとMarkdown bodyを持つ。

共通front matter:

```yaml
command: plan
step: review
cycle: 1
result: needs_fix
blocking_findings: 0
major_findings: 1
minor_findings: 2
info_findings: 0
waived_major_findings: 0
```

Supervision front matter:

```yaml
command: plan
step: supervision
cycle: 1
state: planned
result: passed
human_gate: required
approval_required: true
blocking_findings: 0
major_findings: 1
minor_findings: 2
info_findings: 0
waived_major_findings: 0
decision_items_count: 2
```

Rejected supervision:

```yaml
command: compose
step: supervision
target: slides/my-talk
generated_at: 2026-06-05T17:10:00+09:00
workflow_run_id: 20260605-171000-my-talk-plan
cycle: 2
state: none
result: rejected
failure_reason: needs_replan
blocking_findings: 1
major_findings: 0
minor_findings: 0
info_findings: 0
waived_major_findings: 0
```

Loop monitor configuration:

```yaml
loop_monitors:
  - cycle:
      - inspect_visual
      - repair_visual
      - render
    threshold: 3
    judge:
      persona: takt-marp-slide-supervisor
      instruction: loop-monitor-reviewers-fix
      rules:
        - condition: 健全（進捗あり）
          next: inspect_visual
        - condition: 非生産的（同じ指摘の反復・修正未反映）
          next: ABORT
```

Loop monitoring is handled by TAKT `loop_monitors`; deck-local loop monitor reports are not generated. 収束はreview/inspection/verificationの `result: passed` で表す。

## Findingモデル

Finding reportはstable IDを使う。

必須fields:

- `finding_id`
- `severity`
- `category`
- `target`
- `description`
- `evidence`
- `recommended_fix`
- `status`

Status:

- `new`
- `resolved`
- `persists`
- `reopened`

Severity:

- `blocker`
- `major`
- `minor`
- `info`

ID例:

```text
PLAN-SLIDE-COUNT-TIMEBOX
PLAN-SOURCE-TRACEABILITY-S03
COMPOSE-PLAN-CONFORMANCE-S02
COMPOSE-SVG-MISSING-S04
POLISH-VISUAL-S03-FIGURE-SIZE
DELIVER-PDF-MISSING
DELIVER-HTML-UNREADABLE
```

## Decision items

Human decision itemsはfindingsと分ける。

- findings: quality/contract issues
- decision items: human choices

`status: approved` があり、明示的なoverrideがなければ、decision itemsはまとめて承認された扱いにする。

## 履歴/archive設計

Canonical latest report:

```text
review/{command}-{role}.md
```

Cycle snapshot:

```text
review/history/{command}-{role}.cycle-{n}.md
```

Force invalidation snapshot:

```text
review/history/{command}-{role}.force-{source-command}.{timestamp}.md
```

Rerun after rejected snapshot:

```text
review/history/{command}-{role}.rerun-after-rejected.{timestamp}.md
```

Snapshot対象:

- review
- inspection
- verification
- fix
- repair
- loop-monitor
- supervision

Approval fileは通常上書きしないためsnapshot対象外。ただし `--force` で上書きする場合は旧fileをarchiveする。

## Force/rerun設計

Successful commandの再実行には `--force` が必要。

Rejected commandの再実行は `--force` 不要。ただし既存command reportsはarchiveする。

`--force` はTAKT起動前に、対象commandとdownstream command statesを無効化する。

Invalidationでarchiveするもの:

- canonical reports
- approval files

Invalidationで削除するもの:

- `dist/<deck>/`
- `.takt/render/<deck>/`

Invalidationで削除しないもの:

- `brief.md`
- `brief.normalized.md`
- `plan.md`
- `design-system.md`
- `SLIDES.md`
- `images/*.svg`

TAKT失敗時のrollbackはしない。

## Script設計

### scripts/lib/takt-marp-slide-workflow.mjs

責務:

- target validation
- deck path resolution
- YAML front matter parse
- supervision validation
- approval validation
- report archiving
- approval file writing helper
- generated directory cleanup

### scripts/takt-marp-run-slide-workflow.mjs

責務:

- commandとtargetをparseする
- `slides/<deck>` targetを検証する
- prerequisitesを検証する
- rerun protectionを適用する
- `--force` invalidationをTAKT起動前に実行する
- `.takt/workflows/takt-marp-slide-{command}.yaml` の存在を検証し、missingならTAKTを起動せず未実装 workflow として actionable error を返す
- `./node_modules/.bin/takt --pipeline --skip-git -w takt-marp-slide-{command} -t "slides/<deck>"` をspawnする
- TAKTのexit codeを返す

### scripts/takt-marp-check-slide-workflow-state.mjs

責務:

- expected state/approvalをfront matterで検証する
- waiver structureとfinding referenceを検証する
- actionable errorを出す

### scripts/takt-marp-approve-slide-workflow-state.mjs

責務:

- `plan` または `compose` だけを受け付ける
- `--by` を必須にする
- matching supervision reportを検証する
- `--force` なしの上書きを拒否する
- `waivers: []` と `decisions: []` を持つapproval front matterを書く

### scripts/takt-marp-render-slide-workflow-evidence.mjs

責務:

- polish開始時に対象cycleの `.takt/render/<deck>/cycle-{n}/` だけをcleanする
- cycle-specific evidence directoryを作る。過去cycleの evidence は loop monitor が比較できるよう保持する
- Marp CLI image outputでPNG evidenceを生成する
- preview serverを起動確認する
- PDFを生成する
- `pdftoppm` があればPDFをrasterizeする
- metadataを書く
- preview serverを確実に停止する

`pdftoppm` missingはminor degraded mode。HTML/slide PNG生成失敗はblocker。Preview server startup failureはmajor。`polish` でのPDF生成失敗はmajor。`deliver` で `plan.md` の `deliverables` に含まれるPDF生成失敗はblocker。

## Facet設計

利用可能なbuilt-in facetsは `extends` して使う。

Local facetsはMarp、SVG-first、deck artifact、human gate、render inspection固有の薄い差分に寄せる。

Report output contracts:

```text
slide-finding-report.md
slide-fix-report.md
slide-supervision-report.md
slide-approval.md
```

Marp-specific artifact contracts:

```text
takt-marp-slide-plan.md
takt-marp-design-system.md
```

Policies:

```text
takt-marp-general-slide-quality
takt-marp-slide-quality
takt-marp-svg-first-visual
takt-marp-worker-boundary
```

Preferred inheritance:

```text
takt-marp-general-slide-quality extends design-fidelity
takt-marp-slide-quality extends takt-marp-general-slide-quality
```

Local-to-local extendsが非対応なら、`takt-marp-slide-quality` は `design-fidelity` を直接extendsする。

Personas:

```text
takt-marp-slide-planner
takt-marp-slide-writer
takt-marp-slide-reviewer
takt-marp-slide-reviser
takt-marp-slide-qa
takt-marp-slide-supervisor
```

Workflow YAMLのstep名はsnake_case、外部report filenameはkebab-caseにする。

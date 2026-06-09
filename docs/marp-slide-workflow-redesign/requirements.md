# MarpスライドWorkflow再設計 要件

## 目的

TAKTベースのMarpスライド生成は、ユーザー向けのトップレベルコマンドを明確にしつつ、review、fix、loop monitor、supervisionを各command workflow内部に閉じる。中途半端な中間状態を通常のユーザー向けコマンドとして露出しない。

## 用語

- Command: `plan` や `compose` のようなユーザーが実行する命令。
- State: command完了後に到達する成果物状態。例: `planned`、`composed`。
- Event: 状態遷移を考えるための過去形概念。command名には使わない。
- Supervision: workflow全体の完了契約を確認し、状態を外に出してよいか判定する最終確認。
- Approval: 人間の意思決定記録。TAKT生成reportとは分離する。

## ユーザー向けコマンド

canonical commandは次の4つ。

- `plan`
- `compose`
- `polish`
- `deliver`

canonical npm entrypoint:

```bash
npm run slide:plan -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" plan --by <name>
npm run slide:compose -- "slides/<deck>"
npm run slide:approve -- "slides/<deck>" compose --by <name>
npm run slide:polish -- "slides/<deck>"
npm run slide:deliver -- "slides/<deck>"
```

target contractは常に `slides/<deck>` とする。

無効なtarget:

- `slides/<deck>/brief.md`
- 任意のMarkdownファイル
- `slides/` 外のpath

## 状態モデル

| Command | 到達状態 | 主な成果物 |
|---------|----------|------------|
| `plan` | `planned` | normalized brief と deck plan contract |
| `compose` | `composed` | design system、Marp source deck、SVG visuals |
| `polish` | `polished` | render evidenceに基づいて磨かれたsource deck |
| `deliver` | `delivered` | `plan.md` の `deliverables` に従って `dist/<deck>/` に生成されたofficial artifacts |

有効なsupervision state:

- `planned`
- `composed`
- `polished`
- `delivered`
- `none`

commandが成果物状態に到達できない場合は `state: none` と `result: rejected` を使う。

## 廃止するコマンド

次の概念はトップレベルコマンドとして残さない。

- `draft`
- `review-revise`
- `build-qa`
- `qa`

Review、fix、QA的な確認、supervisionは内部stepの責務にする。

## 各commandの責務

### plan

`plan` は次を行う。

- `slides/<deck>` をtargetとして受け取る
- `brief.md` を要求する
- `brief.normalized.md` を生成する
- `plan.md` を生成する
- `plan.md` に `deliverables: [html|pdf|pptx]` を正規化して記録する
- plan専用観点でreviewする
- bounded loop内で構造的なplan問題をfixする
- `review/plan-supervision.md` を生成する
- 人間承認待ちでもworkflowとしては完了する

`plan` は次をしてはいけない。

- event date、audience、core message、人間判断を捏造する
- unsupported deliverablesを黙って落とす
- `review/plan-approval.md` を作る

### compose

`compose` は次を行う。

- `state: planned` かつ `result: passed` の `review/plan-supervision.md` を要求する
- `status: approved` の `review/plan-approval.md` を要求する
- `design-system.md` を生成する
- `SLIDES.md` を生成する
- plannedな `images/*.svg` を生成する
- source completenessを静的に確認する
- content、flow、visual、assertionの観点でcompositionをreviewする
- parallel review findingsを `review/compose-review.md` に集約する
- bounded loop内でcomposition issuesをfixする
- `review/compose-supervision.md` を生成する
- 人間承認待ちでもworkflowとしては完了する

`compose` は次をしてはいけない。

- `plan.md` 外でslide count、slide order、core message、audience、visual scopeを変更する
- render結果を完了条件にする
- `review/compose-approval.md` を作る

### polish

`polish` は次を行う。

- `state: composed` かつ `result: passed` の `review/compose-supervision.md` を要求する
- `status: approved` の `review/compose-approval.md` を要求する
- `.takt/render/<deck>/` にrender evidenceを生成する
- preview server起動を確認する
- HTMLまたはslide PNG screenshotsを生成する
- PDFを生成し、可能ならPDF raster screenshotsも生成する
- mechanical checksとagent目視判断でvisual/layout品質をinspectする
- visual、layout、render fidelity、design tokenに限定してrepairする
- `review/polish-supervision.md` を生成する

`polish` が編集してよいもの:

- `design-system.md`
- `SLIDES.md`
- `images/*.svg`

`polish` が変更してはいけないもの:

- slide message
- slide order
- slide count
- audience
- source mapping
- visual scope

contentやdesign structureの変更が必要な場合、`polish` は適切なfailure reasonでrejectする。

### deliver

`deliver` は次を行う。

- `state: polished` かつ `result: passed` の `review/polish-supervision.md` を要求する
- `plan.md` から `deliverables` を読む
- `plan.md` の `deliverables` だけを生成する
- export前に `dist/<deck>/` をcleanする
- final artifactsを `dist/<deck>/` に出す
- artifact存在とreadabilityを検証する
- `review/deliver-supervision.md` を生成する

対応するdeliverable:

- `html`
- `pdf`
- `pptx`

unsupported deliverableはdeliveryをrejectする。

## 人間Gate要件

Human approvalが必要なのは次だけ。

- `plan`
- `compose`

通常approvalを要求しないもの:

- `polish`
- `deliver`

Approval fileは人間が作る記録である。

- `review/plan-approval.md`
- `review/compose-approval.md`

TAKT workflow agentはapproval fileを作成・編集してはいけない。

TAKT workflow agentは次を実行してはいけない。

- `npm run slide:approve`
- `node scripts/takt-marp-approve-slide-workflow-state.mjs`

Codex main agentは、ユーザーが明示的に承認を指示した場合だけ `slide:approve` を実行できる。`次へ`、`よしなに`、`進めて` は承認として扱わない。

## ループ要件

各command workflowは次を持つ。

- 明示的なretry budget
- 独立したloop monitor step
- progress criteria
- escalation/rejection path

Budget:

| Command | Max Fix Cycles |
|---------|----------------|
| `plan` | 2 |
| `compose` | 2 |
| `polish` | 3 |
| `deliver` | 2 |

Fix/repair後は必ずloop monitorを通り、次のreview/inspection/verification cycleに戻る。Fix stepから直接supervisionへ進んではいけない。

## レポート要件

すべてのworkflow reportはYAML front matterとMarkdown bodyを持つ。

状態判定に使うsupervision reportは `target`、`generated_at`、`workflow_run_id` を持つ。Approval file は `target`、`approved_at`、`supervision_workflow_run_id` を持ち、approval 自体の `generated_at` や `workflow_run_id` は要求しない。`generated_at` と `approved_at` はparse必須の記録時刻であり、stale判定の主キーはapprovalの `supervision_workflow_run_id` とcanonical supervisionの `workflow_run_id` の一致である。

Findingがあるreportではstable finding IDを使う。

Severity:

- `blocker`
- `major`
- `minor`
- `info`

Result:

- `passed`
- `needs_fix`
- `needs_human_decision`
- `rejected`

Failure reason:

- `invalid_target`
- `missing_input`
- `needs_human_approval`
- `needs_replan`
- `needs_recompose`
- `needs_polish`
- `needs_human_visual_decision`
- `loop_exhausted`
- `build_failed`
- `export_failed`
- `artifact_missing`
- `unsupported_deliverable`

## Waiver要件

Blocker findingはwaive不可。

Major findingは次のapproval fileでのみwaive可能。

- `review/plan-approval.md`
- `review/compose-approval.md`

Minor/info findingはsupervision reportに理由があれば残せる。

Waiveされたmajor findingも `major_findings` には残し、別途 `waived_major_findings` で数える。

```yaml
major_findings: 1
waived_major_findings: 1
blocking_findings: 0
result: passed
```

## Script要件

決定論的helper scriptを用意する。

- `scripts/takt-marp-run-slide-workflow.mjs`
- `scripts/takt-marp-check-slide-workflow-state.mjs`
- `scripts/takt-marp-approve-slide-workflow-state.mjs`
- `scripts/takt-marp-render-slide-workflow-evidence.mjs`
- `scripts/lib/takt-marp-slide-workflow.mjs`

Front matter parseのためだけに新規依存を追加しない。

`takt-marp-run-slide-workflow.mjs` は `.takt/workflows/takt-marp-slide-{command}.yaml` の存在を検証した上で `./node_modules/.bin/takt` を直接呼び、常に `--skip-git` を使う。対応するworkflow YAMLが存在しない場合はTAKTを起動せず、未実装workflowとexpected pathを示すactionable errorで失敗する。

## 再実行要件

既にsuccessful supervision reportがあるcommandは、デフォルトで再実行を拒否する。

再実行には `--force` が必要。

前回supervisionが `result: rejected` の場合は `--force` なしで再実行できる。ただし既存command reportsは先にarchiveする。

`--force` はtarget、command prerequisites、workflow YAML availability、TAKT executable availabilityのpreflightが通った後、TAKT起動前に対象commandとdownstream commandのcanonical reports/approvalsをarchiveする。TAKT起動後に失敗してもrollbackしない。

## 出力要件

Deck source artifacts:

```text
slides/<deck>/
  brief.md
  brief.normalized.md
  plan.md
  design-system.md
  SLIDES.md
  images/*.svg
  review/*.md
```

Polish evidence:

```text
.takt/render/<deck>/
```

Deliver artifacts:

```text
dist/<deck>/
```

`dist/<deck>/` と `.takt/render/<deck>/` はgenerated outputsなのでstale時に削除してよい。`SLIDES.md`、`design-system.md`、`images/*.svg` などのsource artifactsは人間編集を含む可能性があるため自動削除しない。

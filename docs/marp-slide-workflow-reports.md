# Marp Slide Workflow Report Schema

この文書は `slide:*` deterministic scripts と TAKT workflow output contract が共有するYAML front matter schemaである。

## Base

すべてのworkflow reportはYAML front matterとMarkdown bodyを持つ。

必須field:

- `command`: `research`、`plan`、`compose`、`polish`、`deliver`
- `target`: `slides/<deck>`
- `generated_at`: parse可能な記録時刻
- `workflow_run_id`: workflow runを識別する文字列
- `step`: reportを生成したstep
- `result`: `passed`、`rejected`、`needs_fix`、`failed`

`generated_at` はparse必須だが、時間経過だけではstale判定しない。Stale判定の主キーはcanonical supervisionの `workflow_run_id` とapprovalの `supervision_workflow_run_id` の一致である。

## Supervision

Canonical path:

```text
slides/<deck>/review/{command}-supervision.md
```

`research` だけは review domain ではなく research domain に隔離する。

```text
slides/<deck>/research/research-supervision.md
```

必須field:

- `command`
- `target`
- `generated_at`
- `workflow_run_id`
- `step: supervision`
- `cycle`
- `state`
- `result`
- `blocking_findings`
- `major_findings`
- `minor_findings`
- `info_findings`

`research` のsuccess stateは `researched`、`plan` は `planned`、`compose` は `composed`、`polish` は `polished`、`deliver` は `delivered` とする。

`plan` と `compose` では `approval_required: true` を使える。Approval待ちはTAKT workflow失敗ではなく、人間確認待ちの状態である。
`research` は approval を持たない。

例:

```yaml
command: plan
target: slides/my-talk
generated_at: 2026-06-05T17:10:00+09:00
workflow_run_id: 20260605-171000-my-talk-plan
step: supervision
cycle: 1
state: planned
result: passed
approval_required: true
blocking_findings: 0
major_findings: 0
minor_findings: 0
info_findings: 0
```

`research-supervision.md` の例:

```yaml
command: research
target: slides/my-talk
generated_at: 2026-06-05T16:50:00+09:00
workflow_run_id: 20260605-165000-my-talk-research
step: supervision
cycle: 1
state: researched
result: passed
blocking_findings: 0
major_findings: 0
minor_findings: 0
info_findings: 0
```

## Research Artifacts

Canonical paths:

```text
slides/<deck>/research/research-brief.md
slides/<deck>/research/research-report.md
slides/<deck>/research/research-sources.md
slides/<deck>/research/research-claims.md
slides/<deck>/research/open-questions.md
slides/<deck>/research/research-supervision.md
```

`research-brief.md` は `research` command の人間入力であり、runner は `brief.md` から暗黙推測しない。

`research-report.md` は TAKT built-in `deep-research` の出力を byte-for-byte copy した正本である。repo-local adapter は `research-report.md` の front matter や本文を再生成・整形・置換しない。built-in report の source locator は current run の selected parent reports directory の内側だけを探索し、`workflow-deep-research` subworkflow の `research-report.md` を優先する。

`research-sources.md`、`research-claims.md`、`open-questions.md` は built-in `research-report.md` から派生する adapter output である。共通 front matter:

```yaml
command: research
target: slides/<deck>
generated_at: 2026-06-05T16:55:00+09:00
workflow_run_id: 20260605-165000-my-talk-research
source_report: research-report.md
source_report_origin: builtin_deep_research
```

派生成果物は built-in report に存在する情報だけを抽出する。URL、取得日、確度、claim/source 対応が built-in report にない場合は推測せず、`not_present_in_builtin_report` または空配列と caveat で欠落を明示する。

`research-sources.md` は `source_id`、`title`、`url`、`retrieved_at`、`source_type`、`confidence` を持つ。`research-claims.md` は `claim_id`、`claim`、`confidence`、`source_ids`、`slide_use`、`caveats` を持つ。`open-questions.md` は `question_id`、`question`、`why_it_matters`、`suggested_next_step` を持つ。

`research` の sync は research domain への atomic replace とする。`research-report.md`、adapter outputs、`research-supervision.md` は `slides/<deck>/research/` に同期し、`slides/<deck>/review/` へは同期しない。

## Approval

Approval fileは人間の意思決定記録であり、TAKT workflow agentは生成しない。

Canonical path:

```text
slides/<deck>/review/{command}-approval.md
```

対象command:

- `plan`
- `compose`

必須field:

- `status: approved`
- `command`
- `target`
- `approved_state`
- `supervision_workflow_run_id`
- `approved_by`
- `approved_at`
- `waivers`
- `decisions`

Approval自体の `generated_at` と `workflow_run_id` は要求しない。`approved_at` はparse必須である。

例:

```yaml
status: approved
command: plan
target: slides/my-talk
approved_state: planned
supervision_workflow_run_id: 20260605-171000-my-talk-plan
approved_by: j5ik2o
approved_at: 2026-06-05T17:11:11+09:00
waivers: []
decisions: []
```

## Finding

Findingは同じ問題に同じ `finding_id` を使う。再発時に別IDへ逃がさない。

必須field:

- `finding_id`
- `severity`
- `status`
- `cycle`

`severity`:

- `blocker`
- `major`
- `minor`
- `info`

`status`:

- `new`
- `resolved`
- `persists`
- `reopened`

## Loop Monitor

Fix/review loopの収束監視は、deck-local reportではなくTAKT workflow直下の `loop_monitors` が担う。

設定要件:

- `cycle` は実際に反復する step 名を順番に並べる
- `threshold` は非生産的な反復を判定するための発動閾値にする
- `judge.instruction` はTAKT built-in instructionを参照する
- 非生産的な反復は success supervision に進めず、`ABORT` へ遷移させる

## Archive Naming

Canonical reportsを再実行前に退避する場合、次の形式を使う。

```text
slides/<deck>/review/history/{timestamp}-{reason}-{filename}
```

`research` の場合は次の path を使う。

```text
slides/<deck>/research/history/{timestamp}-{reason}-{filename}
```

`reason`:

- `rejected-rerun`
- `force`

Rejected rerunでは対象commandのcanonical reportsをarchiveする。Force invalidationでは対象command以降のcanonical reportsとapproval filesをarchiveする。
ただし `research --force` は research artifacts だけを退避し、`plan / compose / polish / deliver` の review reports と approval files は退避しない。

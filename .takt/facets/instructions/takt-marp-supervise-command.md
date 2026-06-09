{extends:supervise}

command の最終 supervision report を作成してください。

**やること:**
1. 対象 command の work/finding/fix report と source artifacts を確認してください。finding report は plan/compose では `review/<command>-review.md`、polish では `review/polish-inspect.md`、deliver では `review/deliver-verify.md` です。fix/review の反復停止は TAKT workflow の `loop_monitors` が担うため、deck-local な loop monitor report は要求しないでください。
2. report schema、source artifact の存在、未解消 finding、approval requirement を検証してください。
3. foundation schema に従う front matter を持つ `review/<command>-supervision.md` を書いてください。
4. `plan` は `state: planned`、`compose` は `state: composed`、`polish` は `state: polished`、`deliver` は `state: delivered` としてください。
5. `plan` と `compose` は `human_gate: required`、`approval_required: true` とし、`polish` と `deliver` は `human_gate: not_required`、`approval_required: false` としてください。approval file は作成しないでください。
6. finding counts は `blocking_findings`、`major_findings`、`minor_findings`、`info_findings`、`waived_major_findings`、`decision_items_count` で記録してください。

**front matter の厳格ルール:**
- `review/<command>-supervision.md` の先頭は必ず YAML front matter から始めてください。説明文を front matter より前に置かないでください。
- `command` は短い command 名だけにしてください: `plan` / `compose` / `polish` / `deliver`。`takt-marp-slide-plan` や `supervise_plan` を書いてはいけません。
- `target` は deck target を `slides/<deck>` 形式で書いてください。`deck` キーを使ってはいけません。
- `generated_at` は parse 可能な ISO timestamp にしてください。
- `workflow_run_id` は空でない実行識別子にしてください。TAKT run id または既存 report の `workflow_run_id` を使ってください。
- `step` は必ず `supervision`、`cycle` は数値にしてください。
- `state`、`result`、`blocking_findings`、`major_findings`、`minor_findings`、`info_findings` は foundation state validator の必須項目です。省略してはいけません。

必須 front matter 例:

```yaml
---
command: plan
target: slides/_workflow-smoke
generated_at: 2026-06-06T00:00:00.000Z
workflow_run_id: 20260606-000000-slides-workflow-smoke
step: supervision
cycle: 1
state: planned
result: passed
human_gate: required
approval_required: true
approval_file: review/plan-approval.md
blocking_findings: 0
major_findings: 0
minor_findings: 0
info_findings: 0
waived_major_findings: 0
decision_items_count: 0
---
```

**判定基準:**
- 成果物境界と report schema が満たされ、未解消の blocker がなければ `result: passed` としてください。
- 必須 artifact、schema、未解消 finding に問題があれば `result: rejected` としてください。

**必須出力**
## Supervision
- Result: passed / rejected
- State:
- Human gate:
- Approval required:
- Finding counts:
- Blocking issues:

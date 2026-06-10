plan command の成果物をレビューしてください。

**やること:**
1. `brief.md`、`brief.normalized.md`、`plan.md`、`review/plan-work.md` を読んでください。deck-local `brief.normalized.md` / `plan.md` / `review/plan-work.md` が存在しない場合は、この step の `Report Directory/brief.normalized.md` / `Report Directory/plan.md` / `Report Directory/plan-work.md` を読んでください。
2. 発表目的、聴衆、中心メッセージ、slide count、各スライドの Message/Layout/Content/Visual/Source が矛盾していないか確認してください。
3. `plan.md` の requested deliverables が `brief.md` / `brief.normalized.md` の Output Requirements と矛盾していないか確認してください。
4. 修正が必要な finding だけを stable `finding_id` 付きで記録してください。
5. `review/plan-review.md` を書いてください。

**判定基準:**
- 修正不要なら `approved` としてください。
- plan source artifact の修正で解消できる問題がある場合は `needs_fix` としてください。
- 入力不足で判断不能な場合だけ `blocked` としてください。
- deck-local に artifact がまだ同期されていないことだけを `blocked` 理由にしないでください。TAKT run 内では `Report Directory` の source artifact を正本として扱います。

**report file format:**
- `review/plan-review.md` は YAML front matter で開始し、`command: plan`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: review`、`cycle`、`state: reviewed`、`result`、`finding_count`、`blocking_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Plan Review
- Result: approved / needs_fix / blocked
- Findings:
- Blocking issues:

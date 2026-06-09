{extends:fix}

plan review の finding を精査し、妥当な修正だけを plan source artifacts に反映してください。

**やること:**
1. `review/plan-review.md` の finding を読み、`brief.md` と `brief.normalized.md` に照らして妥当性を判断してください。deck-local `review/plan-review.md` / `brief.normalized.md` / `plan.md` が存在しない場合は、この step の `Report Directory/plan-review.md` / `Report Directory/brief.normalized.md` / `Report Directory/plan.md` を読んでください。
2. 妥当な finding は `plan.md` または `brief.normalized.md` に反映してください。TAKT run 内では `Report Directory/plan.md` と `Report Directory/brief.normalized.md` を正本として更新し、deck-local artifact が存在する場合は同じ内容にしてください。
3. 妥当でない finding は理由を記録し、source artifact へ反映しないでください。
4. `review/plan-fix.md` に finding ごとの対応結果を書いてください。

**判定基準:**
- 妥当な finding をすべて反映または理由付きで非対応にした場合は `fixed` としてください。
- 安全に修正できない場合は `blocked` としてください。
- deck-local に artifact がまだ同期されていないことだけを `blocked` 理由にしないでください。`Report Directory` の source artifact が読めるかで判断してください。

**report file format:**
- `review/plan-fix.md` は YAML front matter で開始し、`command: plan`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: fix`、`cycle`、`state: fixed`、`result`、`applied_finding_count`、`rejected_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Plan Fix
- Result: fixed / blocked
- Applied findings:
- Rejected findings:
- Files changed:
- Blocking issues:

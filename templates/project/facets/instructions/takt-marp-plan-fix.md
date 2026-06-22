{extends:fix}

plan review の finding を精査し、妥当な修正だけを plan source artifacts に反映してください。

**やること:**
1. `review/plan-review.md` の finding を読み、`brief.md`、`brief.normalized.md`、`reference-analysis.md`、`plan.md`、`slide-blueprint.md` に照らして妥当性を判断してください。deck-local `review/plan-review.md` / `brief.normalized.md` / `reference-analysis.md` / `plan.md` / `slide-blueprint.md` が存在しない場合は、この step の `Report Directory/plan-review.md` / `Report Directory/brief.normalized.md` / `Report Directory/reference-analysis.md` / `Report Directory/plan.md` / `Report Directory/slide-blueprint.md` を読んでください。
2. 妥当な finding は `plan.md`、`slide-blueprint.md`、または `brief.normalized.md` に反映してください。TAKT run 内では `Report Directory/plan.md`、`Report Directory/slide-blueprint.md`、`Report Directory/brief.normalized.md` を正本として更新し、deck-local artifact が存在する場合は同じ内容にしてください。
3. 妥当でない finding は理由を記録し、source artifact へ反映しないでください。
4. Coverage Matrix 欠落、Design Contract section / `contract_sha256` / Design Brief fingerprint / `guidance` / `source_catalog` 欠落、slide-blueprint 欠落、Section Assembly Manifest 欠落、Visual Strategy 欠落、HTML/CSSで足りるvisualの過剰SVG化、固定アウトライン欠落、禁止語欠落、slide count 矛盾、正式タイトル/講師所属/題材の欠落は、妥当なら current plan command 境界内で修正してください。Design Contract metadata は `.takt/workflow-current-target.json` と marker の `design_contract.path` が指す Resolved Design Contract から反映してください。brief 自体の Target slide count が誤っている場合は、`plan.md` の Plan Findings に「brief 修正が必要」と残し、勝手に brief の意思を書き換えないでください。
5. `review/plan-fix.md` に finding ごとの対応結果を書いてください。

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
- Design Contract metadata:
- Rejected findings:
- Files changed:
- Blocking issues:

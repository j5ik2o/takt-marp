{extends:fix}

compose review の finding を精査し、妥当な修正だけを compose source artifacts に反映してください。

**やること:**
1. `review/compose-review.md` の finding を読み、`plan.md` と `design-system.md` に照らして妥当性を判断してください。
2. 妥当な finding は `design-system.md`、`sections/*`、`SLIDES.md`、HTML visual、`images/*` に反映してください。
3. plan-level content 変更が必要な finding は反映せず、理由を記録してください。
4. `review/compose-fix.md` に finding ごとの対応結果を書いてください。

**判定基準:**
- 妥当な finding をすべて反映または理由付きで非対応にした場合は `fixed` としてください。
- 安全に修正できない場合は `blocked` としてください。

**report file format:**
- `review/compose-fix.md` は YAML front matter で開始し、`command: compose`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: fix`、`cycle`、`state: fixed`、`result`、`applied_finding_count`、`rejected_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Compose Fix
- Result: fixed / blocked
- Applied findings:
- Rejected findings:
- Files changed:
- Blocking issues:

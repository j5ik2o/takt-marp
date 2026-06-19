{extends:fix}

polish inspection の finding を精査し、visual/layout/render/design-token 関連の修正だけを反映してください。

**やること:**
1. `review/polish-inspect.md` の finding を読み、`design-system.md`、`sections/*`、`SLIDES.md`、HTML visual、`images/*` に照らして妥当性を判断してください。
2. 妥当な finding は `design-system.md`、`sections/*`、`SLIDES.md`、HTML visual、`images/*` の範囲で修正してください。
3. plan-level content、中心メッセージ、deliverables、official delivery artifact に関する finding は反映せず理由を記録してください。
4. `review/polish-fix.md` に finding ごとの対応結果を書いてください。

**判定基準:**
- 妥当な finding をすべて反映または理由付きで非対応にした場合は `fixed` としてください。
- 安全に修正できない場合は `blocked` としてください。

**report file format:**
- `review/polish-fix.md` は YAML front matter で開始し、`command: polish`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: fix`、`cycle`、`state: fixed`、`result`、`applied_finding_count`、`rejected_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Polish Fix
- Result: fixed / blocked
- Applied findings:
- Rejected findings:
- Files changed:
- Blocking issues:

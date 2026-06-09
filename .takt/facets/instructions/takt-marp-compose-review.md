compose command の成果物をレビューしてください。

**やること:**
1. `plan.md`、`design-system.md`、`SLIDES.md`、`images/*.svg`、`review/compose-work.md` を読んでください。
2. content、flow、visual source、Marp source artifact 境界の観点で確認してください。
3. render output の有無や表示崩れは polish command の範囲として扱い、この review の成功条件にしないでください。
4. 修正が必要な finding だけを stable `finding_id` 付きで `review/compose-review.md` に記録してください。

**判定基準:**
- compose source artifact の修正が不要なら `approved` としてください。
- `design-system.md`、`SLIDES.md`、`images/*.svg` の修正で解消できる問題がある場合は `needs_fix` としてください。
- plan の変更が必要な問題は source artifact を勝手に直さず `blocked` としてください。

**report file format:**
- `review/compose-review.md` は YAML front matter で開始し、`command: compose`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: review`、`cycle`、`state: reviewed`、`result`、`finding_count`、`blocking_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Compose Review
- Result: approved / needs_fix / blocked
- Findings:
- Out-of-scope findings:
- Blocking issues:

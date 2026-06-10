official delivery artifact の completeness を検証してください。

**やること:**
1. `plan.md` の `deliverables` と `dist/<deck>/` の official artifacts を照合してください。
2. requested artifact が `SLIDES.html` / `SLIDES.pdf` / `SLIDES.pptx` として存在し、読み取り可能であることを確認してください。
3. unrequested official artifact または余分な同種 artifact が混ざっていないことを確認してください。
4. `review/deliver-work.md` と `review/deliver-verify.md` が artifact path と requested deliverables を同じ名前で記録していることを確認してください。
5. `review/deliver-verify.md` に delivery verification finding を記録してください。

**判定基準:**
- requested artifact が存在し、不要 artifact がなければ `approved` としてください。
- delivery artifact の再生成や path 修正で解消できる問題があれば `needs_fix` としてください。
- visual/layout の再評価が必要な問題は scope 外として扱い、delivery finding にしないでください。

**report file format:**
- `review/deliver-verify.md` は YAML front matter で開始し、`command: deliver`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: verify`、`cycle`、`state: verified`、`result`、`finding_count`、`blocking_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Delivery Verify
- Result: approved / needs_fix / blocked
- Artifact checks:
- Unrequested artifacts:
- Findings:
- Blocking issues:

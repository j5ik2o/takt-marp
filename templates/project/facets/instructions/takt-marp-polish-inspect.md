render evidence と compose source artifacts を照合し、visual/layout/render finding を記録してください。

**やること:**
1. `.takt/render/<deck>/cycle-1/metadata.json`、`.takt/workflow-current-target.json`、marker の `design_contract.path` が指す Resolved Design Contract、`sections/*`、`SLIDES.md`、HTML visual、`images/*` を読んでください。
2. HTML/PDF/PDF raster の status と degraded reason を確認してください。
3. visual、layout、render、design-token 関連の問題だけを finding として記録してください。
4. plan-level content、中心メッセージ、delivery artifact の要否は scope 外として扱ってください。
5. `review/polish-inspect.md` に stable `finding_id` 付きで finding を書いてください。

**判定基準:**
- 修正不要なら `approved` としてください。
- visual/layout/render/design-token source correction で解消できる問題がある場合は `needs_fix` としてください。
- render evidence metadata が読めない場合は `blocked` としてください。

**report file format:**
- `review/polish-inspect.md` は YAML front matter で開始し、`command: polish`、`target: slides/<deck>`、`generated_at`、`workflow_run_id`、`step: inspect`、`cycle`、`state: inspected`、`result`、`finding_count`、`blocking_finding_count` を含めてください。
- front matter を閉じる `---` の後に Markdown body を書いてください。front matter より前に本文を書いてはいけません。

**必須出力**
## Polish Inspect
- Result: approved / needs_fix / blocked
- Findings:
- Degraded render notes:
- Out-of-scope notes:
- Blocking issues:

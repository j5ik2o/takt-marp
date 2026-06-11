compose command の成果物をレビューしてください。

**やること:**
1. `brief.normalized.md`、`plan.md`、`design-system.md`、`SLIDES.md`、`images/*.svg`、`review/compose-work.md` を読んでください。
2. content、flow、visual source、Marp source artifact 境界の観点で確認してください。
3. 以下の追加観点で確認してください。
   - (a) **style 定義・文書化の存在照合**: plan の各 Layout(custom 句含む)と `SLIDES.md` の各 `_class:` に対応する style 定義(front matter CSS)が存在するか確認してください。`custom:` 句で新設された class については、加えて deck-local `design-system.md` の文書化(`takt-marp-design-system` の文書化規約: class 名・用途・構造・使用スライド番号)が存在するか確認してください。style 定義の欠落、および新設 class の文書化欠落は **blocker** です(基本語彙の class に 4 項目文書化は要求しません)。
   - (b) **inline SVG の規約適合**: `policy takt-marp-svg-first-visual` の inline SVG 規約(フォントスタック・containment・長文禁止)への適合を確認してください。長文流し込みは **major**、フォントスタック・containment 不適合は **major** です。
   - (c) **尺マーカーの累計整合と捏造検出**: 尺マーカーが存在する場合、最終スライドの累計が `brief.normalized.md` の `Event Context` Duration と整合するか確認してください。不整合は **major** です。また、Duration が「未指定」なのにマーカーが存在する場合も **major** として報告してください。
   - (d) **先鋭度・密度**: `policy takt-marp-general-slide-quality` の先鋭度・密度基準に従い、汎用タイトル・リード文は **major**、置換可能な低密度 bullet 列挙は **minor**(可読性に明確な悪影響がある場合は **major**)として判定してください。好みだけの指摘は finding にしないでください。
   - (e) **`html: true` 欠落と font path 解決不能**: `SLIDES.md` に HTML 要素(inline SVG 含む)があるのに front matter に `html: true` がない場合は **blocker** です。`@font-face` を宣言しているが path が `SLIDES.md` からの相対 path として解決不能な場合は **major** です(フォールバックスタックで描画は維持されるため blocker としない)。
4. render output の有無や表示崩れは polish command の範囲として扱い、この review の成功条件にしないでください。
5. 修正が必要な finding だけを stable `finding_id` 付きで `review/compose-review.md` に記録してください。
6. 既定 severity から逸脱する場合は、finding の evidence に理由を記してください。

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

compose command の成果物をレビューしてください。

**やること:**
1. `brief.normalized.md`、`plan.md`、`slide-blueprint.md`、`.takt/workflow-current-target.json`、marker の `design_contract.path` が指す Resolved Design Contract、`sections/manifest.md`、`sections/*.md`、`SLIDES.md`、HTML visual、`images/*`、`review/compose-work.md` を読んでください。
2. content、flow、visual source、Marp source artifact 境界の観点で確認してください。
3. 以下の追加観点で確認してください。
   - (a) **Design Contract 照合**: marker の `design_contract.fingerprint.contract_sha256` と、`plan.md`、`slide-blueprint.md` の `contract_sha256` が一致することを確認してください。`SLIDES.md` の各 `_class:` と front matter CSS が Resolved Design Contract の token constraints に対応しているか確認してください。plan / blueprint が Design System の `guidance` / `source_catalog` から選定した component prompt、card、sample、template が compose source と矛盾していないかも確認してください。contract_sha256 不一致、style 定義欠落、token constraints と無関係な class 追加、または選定した guidance / source_catalog との明確な不一致は **blocker** です。
   - (b) **visual種別と生成責務の適合**: `policy takt-marp-visual-composition` に従い、`html:` visual が section source と assembled `SLIDES.md` 内HTML/CSSとして実装されていること、`svg:` / `inline-svg:` / `existing:` だけが placeholder から visual asset に接続されていることを確認してください。HTML/CSSで十分なカード・比較・表がSVG化されている場合は **major**、`html:` visual が placeholder のままの場合は **blocker** です。
   - (c) **section assembly整合**: `sections/manifest.md` のslide ID範囲、section fileの `<!-- slide_id: SNNN -->`、assembled `SLIDES.md` のslide順が `slide-blueprint.md` と一致するか確認してください。欠落・重複・順序違いは **blocker** です。
   - (d) **尺マーカーの累計整合と捏造検出**: `brief.normalized.md` の `Event Context` の `Duration` が分単位の数値である場合、各スライドの speaker notes に尺マーカー `【N分 / 累計 M:SS】` が存在するか確認し、欠落しているスライドがあれば **major** として報告してください。尺マーカーが存在する場合、最終スライドの累計が `Duration` と整合するか確認してください。不整合は **major** です。また、`Duration` が「未指定」なのにマーカーが存在する場合も **major** として報告してください。
   - (e) **先鋭度・密度**: `policy takt-marp-general-slide-quality` の先鋭度・密度基準に従い、汎用タイトル・リード文は **major**、置換可能な低密度 bullet 列挙は **minor**(可読性に明確な悪影響がある場合は **major**)として判定してください。好みだけの指摘は finding にしないでください。
   - (f) **`html: true` 欠落と font path 解決不能**: `SLIDES.md` に HTML 要素(HTML visual、inline SVG 含む)があるのに front matter に `html: true` がない場合は **blocker** です。`@font-face` を宣言しているが path が `SLIDES.md` からの相対 path として解決不能な場合は **major** です(フォールバックスタックで描画は維持されるため blocker としない)。
   - (g) **adherence metadata と guidance**: `_adherence.oxlintrc.json` 由来の rule が Resolved Design Contract にある場合、raw hex color、raw px value、未提供 font-family の新規混入を finding として扱ってください。ただし、Resolved Design Contract 由来の custom property 定義そのもの(`:root { --token: raw-value; }` 等)は正当な token 定義であり finding にしないでください。token 定義外の直書きだけを対象にしてください。`SKILL.md` / `readme.md` / component prompt に非交渉条件や禁止事項がある場合は、特定ドメイン名ではなく Design System guidance として確認してください。
4. render output の有無や表示崩れは polish command の範囲として扱い、この review の成功条件にしないでください。
5. 修正が必要な finding だけを stable `finding_id` 付きで `review/compose-review.md` に記録してください。
6. 既定 severity から逸脱する場合は、finding の evidence に理由を記してください。

**判定基準:**
- compose source artifact の修正が不要なら `approved` としてください。
- `sections/*`、`SLIDES.md`、HTML visual、`images/*` の修正で解消できる問題がある場合は `needs_fix` としてください。
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

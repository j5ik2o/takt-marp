# Slide Plan Artifact

この report は `slides/<deck>/plan.md` として同期される source artifact です。

## 出力形式

- Markdown 本文だけを出力してください。
- YAML front matter、コードフェンス、説明用の前置き、後置きは付けないでください。
- `# Slide Plan` から始めてください。

## 必須内容

- Deck Summary
  - Title
  - Audience
  - Duration
  - Core message
  - Narrative arc
  - Deck mode(`overview` / `lecture-body`)
  - Target slide count と planned slide count
  - `deliverables: [html, pdf]` のような単一行
- Sections
- Slides
  - 各 slide は `Message`、`Layout`、`Content`、`Visual`、`Visual Strategy`、`Speaker note intent`、`Source` を持つ
  - `Visual Strategy` には `render_owner: compose_sections` または `render_owner: generate_visuals`、visual種別の判断理由、HTML/CSSで組めるかの判定を含める
- Coverage Matrix
  - Fixed Outline Coverage: 固定アウトラインの章・節・leaf項目ごとに対応 slide ID を示す
  - Chapter Element Coverage: 各章で入れるべき要素ごとに対応 slide ID を示す
  - Visual Rendering Coverage: `html:`、`svg:`、`inline-svg:`、`existing:`、`none` の各visual種別と担当stepを示す
  - Code Example Coverage: コード例方針/Before/After/Java/業務意味の注釈ごとに対応 slide ID を示す
  - Exercise Coverage: 演習と模範回答ごとに対応 slide ID を示す
  - Appendix Coverage: 参考文献、用語集、演習模範回答、実践チェックリスト、導入時注意、既存システム適用手順ごとに対応 slide ID を示す
  - Quality Checklist Coverage: brief の品質チェック項目ごとに対応 slide ID または review gate を示す
- Plan Findings
  - fixed outline や required element の未対応、slide count 矛盾、重要情報の欠落は `needs_input` ではなく stable finding ID 付きで記録する
- Requested Deliverables
  - 後続 delivery command が読む authoritative line として `deliverables: [...]` を含める

## 制約

- Layout は knowledge `takt-marp-repo-conventions` の「Layout 語彙」表にある基本語彙のいずれかにしてください。基本語彙で表現できない場合のみ `custom: <kebab-case-class> — <用途1行>` 句を使用してください。modifier を使う場合は基本 class と併記してください(例: `single profile`)。modifier 単独は不可です。
- Visual は `none`、`html: ...`、`svg: ...`、`inline-svg: ...`、`existing: ...` のいずれかで明示してください。
- `html:` はカード、比較、表、軽量フロー、タイムライン、チェックリスト、コード注釈など section source 内HTML/CSSで構成するvisualです。`render_owner: compose_sections` を指定してください。
- `svg:` と `inline-svg:` は座標制御、複雑な矢印、再利用図版、単体レビューが必要な場合に限定し、`render_owner: generate_visuals` を指定してください。
- `existing:` は明示された既存画像・図版だけに使い、`render_owner: generate_visuals` を指定してください。
- `brief.md` / `brief.normalized.md` の Output Requirements と矛盾する deliverables を計画しないでください。
- Target slide count が固定アウトライン、要求密度、講義本体要件と矛盾する場合、勝手に圧縮・拡張しないでください。`Target slide count: 5` は5枚の概要版として扱い、講義本体を要求する場合は target を100〜140または期待値相当(例: 119)へ修正する必要があることを Plan Findings に記録してください。
- Coverage Matrix の未対応項目を空欄にしないでください。未対応の場合も `not covered` と理由、修正対象 finding ID を書いてください。

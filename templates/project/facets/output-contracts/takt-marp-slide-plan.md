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
- Design Contract
  - Resolved Design Contract の source path、namespace、source_sha256、contract_sha256、token summary、brand fonts、adherence availability を示す
  - `guidance` の primary documents(`SKILL.md` / `readme.md` 等)と component prompts の有無、`source_catalog` の components / cards / templates / sample_slides / guidelines / assets の概要を示す
  - brief と一致する reusable element、sample、template、component prompt を選定した場合は、名前/path、選定理由、使わない主要候補の理由を示す
  - layout / visual / density planning で使う token constraints と、brief 要求との整合・制約を示す
- Plan Findings
  - fixed outline や required element の未対応、slide count 矛盾、重要情報の欠落は `needs_input` ではなく stable finding ID 付きで記録する
- Research Context Usage
  - Available: yes / no
  - Inputs read: `research-report.md`、`research-claims.md`、`open-questions.md` のうち存在したもの
  - Research-derived evidence used: claim_id/source_id または artifact 名で識別できる根拠
  - Unresolved assumptions: `open-questions.md` 由来の未解決前提または保留事項
  - Non-blocking boundary: research artifacts の不在や open questions だけでは `needs_input` にしない
- Requested Deliverables
  - 後続 delivery command が読む authoritative line として `deliverables: [...]` を含める

## 制約

- Layout は knowledge `takt-marp-repo-conventions` の「Layout 語彙」表にある基本語彙のいずれかにしてください。基本語彙で表現できない場合のみ `custom: <kebab-case-class> — <用途1行>` 句を使用してください。modifier を使う場合は基本 class と併記してください(例: `single profile`)。modifier 単独は不可です。
- Visual は `none`、`html: ...`、`svg: ...`、`inline-svg: ...`、`existing: ...` のいずれかで明示してください。
- `html:` はカード、比較、表、軽量フロー、タイムライン、チェックリスト、コード注釈など section source 内HTML/CSSで構成するvisualです。`render_owner: compose_sections` を指定してください。
- `svg:` と `inline-svg:` は座標制御、複雑な矢印、再利用図版、単体レビューが必要な場合に限定し、`render_owner: generate_visuals` を指定してください。
- `existing:` は明示された既存画像・図版だけに使い、`render_owner: generate_visuals` を指定してください。
- `brief.md` / `brief.normalized.md` の Output Requirements と矛盾する deliverables を計画しないでください。
- primary input は `brief.md` / `brief.normalized.md` のまま維持してください。research artifacts は存在時だけ読む optional context です。
- research 由来の根拠を使う場合は `Research Context Usage` と slide の `Source` で artifact/claim/source を識別してください。
- `open-questions.md` は未解決前提または保留として扱い、推測で回答を埋めないでください。
- plan 成功条件に外部 web access や追加調査を加えないでください。
- Design Contract section には marker の `design_contract.path` が指す Resolved Design Contract JSON の `fingerprint.contract_sha256` を `contract_sha256` として記録してください。
- Design Contract section には Resolved Design Contract JSON の `guidance` と `source_catalog` から、この deck で使う Design System 固有の設計入力を記録してください。特定ドメインや特定 component 名を workflow の固定前提として扱わないでください。
- token constraints は CSS 実装ではなく、layout / visual / density / typography の計画制約として記録してください。
- Target slide count が固定アウトライン、要求密度、講義本体要件と矛盾する場合、勝手に圧縮・拡張しないでください。`Target slide count: 5` は5枚の概要版として扱い、講義本体を要求する場合は target を100〜140または期待値相当(例: 119)へ修正する必要があることを Plan Findings に記録してください。
- Coverage Matrix の未対応項目を空欄にしないでください。未対応の場合も `not covered` と理由、修正対象 finding ID を書いてください。

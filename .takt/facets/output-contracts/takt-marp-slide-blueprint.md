# Slide Blueprint Artifact

この report は `slides/<deck>/slide-blueprint.md` として同期される source artifact です。`plan.md` より細かい、compose用のslide単位設計図です。

## 出力形式

- Markdown 本文だけを出力してください。
- YAML front matter、コードフェンス、説明用の前置き、後置きは付けないでください。
- `# Slide Blueprint` から始めてください。

## 必須内容

- Blueprint Summary
  - Title
  - Deck mode
  - Planned slide count
  - Source basis(`brief.normalized.md` / `reference-analysis.md` / Source Materials)
  - Design Contract summary(source path、namespace、contract_sha256)
- Slide Blueprint Table
  - Slide ID
  - Section
  - Message
  - Content atoms(本文に必ず入れる情報)
  - Visual
  - Visual Strategy
  - Speaker note intent
  - Source
  - Coverage IDs
- Section Assembly Manifest
  - `sections/manifest.md` に書くべきsection順序
  - 各section file名、含めるslide ID範囲、想定slide count
- Coverage Trace
  - Fixed Outline Coverageへの逆引き
  - Chapter Element Coverageへの逆引き
  - Code Example / Exercise / Appendix / Quality Checklistへの逆引き
- Design Contract Trace
  - `plan.md` と同じ contract_sha256 を示す
  - 各section/slideで参照すべき token constraints、layout / visual / density 制約、brand fonts、adherence availability を示す
- Plan Findings Trace
  - 未解決findingと、blueprint上で修正すべきslide ID

## 制約

- `plan.md` と slide count、section range、coverage、deliverables が矛盾してはなりません。
- `plan.md` の Design Contract section と contract_sha256、token constraints が矛盾してはなりません。
- 各 slide ID は `S001` 形式で連番にしてください。
- `Visual` は `none`、`html: ...`、`svg: ...`、`inline-svg: ...`、`existing: ...` のいずれかです。
- `Visual Strategy` には `render_owner: compose_sections` または `render_owner: generate_visuals`、HTML/CSSで組めるか、SVGを選ぶ場合はその理由を含めてください。
- composeはこの artifact を本文生成の主入力にします。抽象的な章説明だけで終わらせず、各slideのcontent atomsを具体化してください。

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
  - `deliverables: [html, pdf]` のような単一行
- Sections
- Slides
  - 各 slide は `Message`、`Layout`、`Content`、`Visual`、`Speaker note intent`、`Source` を持つ
- Requested Deliverables
  - 後続 delivery command が読む authoritative line として `deliverables: [...]` を含める

## 制約

- Layout は `single`、`visual`、`visual-full`、`split-50-50`、`split-40-60`、`split-60-40`、`compare-2col` のいずれかにしてください。
- Visual は `none`、`svg: ...`、`existing: ...` のいずれかで明示してください。
- `brief.md` / `brief.normalized.md` の Output Requirements と矛盾する deliverables を計画しないでください。

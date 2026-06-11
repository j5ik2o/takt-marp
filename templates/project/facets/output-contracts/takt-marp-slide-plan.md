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

- Layout は knowledge `takt-marp-repo-conventions` の「Layout 語彙」表にある基本語彙のいずれかにしてください。基本語彙で表現できない場合のみ `custom: <kebab-case-class> — <用途1行>` 句を使用してください。
- Visual は `none`、`svg: ...`、`existing: ...` のいずれかで明示してください。
- `brief.md` / `brief.normalized.md` の Output Requirements と矛盾する deliverables を計画しないでください。

# Reference Deck Analysis Artifact

この report は `slides/<deck>/reference-analysis.md` として同期できる source artifact です。参照デッキが存在する場合も、本文をコピーせず、構造・密度・coverage 期待値だけを分析します。

## 出力形式

- Markdown 本文だけを出力してください。
- YAML front matter、コードフェンス、説明用の前置き、後置きは付けないでください。
- `# Reference Deck Analysis` から始めてください。

## 必須内容

- Reference Source
  - Found: yes / no
  - Path
  - Analysis scope
  - Copy policy: `analysis only; do not copy reference slides`
- Slide Count and Mode
  - Reference slide count
  - Inferred deck mode(`overview` / `lecture-body` / `unknown`)
  - Density profile(低/中/高、本文量、notes量、appendix比率)
- Structure Map
  - Section/chapter ranges
  - Opening/body/appendix ranges
  - Recurring slide patterns
- Coverage Expectations
  - briefの固定アウトライン、章別要素、コード例、演習、巻末資料、品質チェックと対応する期待範囲
- Visual and Layout Patterns
  - HTML/CSSで再構成できる図解種別
  - SVG/既存画像が必要な図解種別
  - 色、余白、情報密度、印刷配布に関する観察
- Reuse Boundary
  - 参照してよいもの(構成、密度、coverage、visual pattern)
  - 参照してはいけないもの(本文コピー、slide単位の丸写し、画像の無断再利用)
- Plan Implications
  - `plan.md` と `slide-blueprint.md` へ伝搬すべき期待値

## 制約

- 参照デッキが `slides.md` / `_slides.md` として存在する場合も、期待値分析だけを行い、本文を直接コピーしないでください。assembled outputである `SLIDES.md` は参照デッキ候補にしてはいけません。
- 参照デッキがない場合も `# Reference Deck Analysis` を出力し、Found: no と Plan Implications を明示してください。
- Target slide count と参照デッキのslide countが矛盾する場合は、勝手に補正せず Plan Implications に finding 候補として残してください。

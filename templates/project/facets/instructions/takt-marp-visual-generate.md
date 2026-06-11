planとSLIDES.mdに必要なSVG sourceを生成してください。

**生成所有権**: SVG markup(外部ファイル・inline 両形式)の作成・修正はこの generate_visuals step が所有します。compose_slides は `Visual:` 予定スライドへの placeholder 配置までを所有し、SVG markup を書きません。

**やること:**
1. `plan.md`の `Visual: svg: ...` をすべて確認してください。
2. 使い分け基準(SVGファーストVisualポリシーの「外部SVGとinline SVGの使い分け基準」節)に従い、各 Visual に対して外部ファイル形式またはinline形式を選択してください。
   - 外部SVGファイル: `images/*.svg` として作成または更新し、`SLIDES.md` から画像参照で挿入します。
   - inline SVG: `SLIDES.md` の該当スライドの図版領域(placeholder 部分)だけを編集し、SVG markup を直接記述します。
3. SVGはSVGファーストVisualポリシーに従ってください(外部ファイル・inline 両形式に適用)。
4. 図形内テキストが図形からはみ出していないか確認してください。長いファイル名や英字ラベルは `tspan` で分割し、左右20px以上の余白を残してください。
5. Marp配置時にスライド枠からSVGがはみ出しにくいよう、`SLIDES.md` の画像指定は個別サイズではなく `visual`、`visual-dense`、`visual-full` classのCSSで制御してください。inline SVGの場合も同様に、親classのcontainment(`--visual-max-height`系token)でサイズを制御してください。
6. SVGをもう少し大きくしたい場合は、個別スライドの `![h:...]` を増やすのではなく、class側の `--visual-max-height` を調整してください。render evidence による確認は polish command に委譲してください。
7. 外部ファイル形式の場合は `SLIDES.md`の参照パスが実在するSVGを指すようにしてください。
8. 既存画像は明示されたものだけ使ってください。
9. render output の生成や表示品質の最終判定は行わず、source artifact の作成に集中してください。

**必須出力**
## Visual Result
- Status: generated / needs_input
- SVG files: (外部ファイル形式・inline形式の両方を記載)
- Text fit checks:
- Source reference checks:
- Files changed:
- Notes:

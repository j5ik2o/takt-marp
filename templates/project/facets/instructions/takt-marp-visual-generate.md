planとSLIDES.mdに必要なSVG sourceを生成してください。

**やること:**
1. `plan.md`の `Visual: svg: ...` をすべて確認してください。
2. 必要なSVGを `images/*.svg` として作成または更新してください。
3. SVGはSVGファーストVisualポリシーに従ってください。
4. 図形内テキストが図形からはみ出していないか確認してください。長いファイル名や英字ラベルは `tspan` で分割し、左右20px以上の余白を残してください。
5. Marp配置時にスライド枠からSVGがはみ出しにくいよう、`SLIDES.md` の画像指定は個別サイズではなく `visual`、`visual-dense`、`visual-full` classのCSSで制御してください。
6. SVGをもう少し大きくしたい場合は、個別スライドの `![h:...]` を増やすのではなく、class側の `--visual-max-height` を調整してください。render evidence による確認は polish command に委譲してください。
7. `SLIDES.md`の参照パスが実在するSVGを指すようにしてください。
8. 既存画像は明示されたものだけ使ってください。
9. render output の生成や表示品質の最終判定は行わず、source artifact の作成に集中してください。

**必須出力**
## Visual Result
- Status: generated / needs_input
- SVG files:
- Text fit checks:
- Source reference checks:
- Files changed:
- Notes:

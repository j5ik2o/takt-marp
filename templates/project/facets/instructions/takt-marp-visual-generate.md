planとSLIDES.mdに必要なvisual sourceを生成・接続してください。

**生成所有権**: `svg:` / `inline-svg:` / `existing:` の作成・接続はこの generate_visuals step が所有します。`html:` visual は compose_sections が section source に直接書くため、この step では生成しません。

**やること:**
1. `plan.md`、`slide-blueprint.md`、`.takt/workflow-current-target.json`、marker の `design_contract.path` が指す Resolved Design Contract、`sections/*.md`、`SLIDES.md` を読んでください。marker の `design_contract.fingerprint.contract_sha256` と `plan.md` / `slide-blueprint.md` の `contract_sha256` が一致することを確認してください。Design Brief fingerprint が記録されている場合は current Resolved Design Contract と一致することも確認してください。不一致の場合は `needs_input` とし、visual source を成功扱いで更新しないでください。
2. Resolved Design Contract の token constraints、brand fonts、adherence metadata、`guidance`、`source_catalog` を、`svg:` / `inline-svg:` / `existing:` の生成・接続にも適用してください。raw hex color、raw px value、未提供 font-family、guidance / source_catalog と矛盾する visual source を新規に入れないでください。
3. `plan.md` と `slide-blueprint.md` の `Visual: html: ...`、`Visual: svg: ...`、`Visual: inline-svg: ...`、`Visual: existing: ...` をすべて確認してください。`sections/*.md` と `SLIDES.md` では、`svg:` / `inline-svg:` / `existing:` の `<!-- Visual: ... -->` placeholderと、`html:` visualとして直接書かれたHTML/CSS構造を確認してください。
4. `html:` visual は生成対象外です。該当スライドにHTML構造が存在し、placeholder のまま残っていないことだけ確認してください。不足している場合は `needs_input` ではなく、compose sourceの修正対象として Notes に記録してください。
5. `svg: ...` は外部SVGファイルとして `images/*.svg` を作成または更新し、`sections/*.md` と `SLIDES.md` の placeholder を画像参照に置き換えてください。SVG内の色、font、サイズ表現は Resolved Design Contract の token / brand fonts / spacing scale に対応させ、対応 token を Notes に記録してください。
6. `inline-svg: ...` は `sections/*.md` と `SLIDES.md` の該当スライドの図版領域(placeholder 部分)だけを編集し、SVG markup を直接記述してください。front matter に `html: true` が未設定の場合は `SLIDES.md` に追加してください。inline SVG の style は `SLIDES.md` の token-driven CSS と矛盾しないようにしてください。
7. `existing: ...` は明示された既存画像への参照を `sections/*.md` と `SLIDES.md` の該当スライドの placeholder 部分に挿入してください。既存画像は明示されたものだけ使い、Design Contract と明確に矛盾する場合は Notes に記録してください。
8. SVGはVisual構成ポリシーのSVG制約に従ってください(外部ファイル・inline 両形式に適用)。
9. SVGキャンバスの約90%を図形・矢印・ラベルなどの意味のある要素で使い、余白は約10%以下に抑えてください。`viewBox 0 0 1100 540` では外周の安全域を左右20-30px、上下16-24px程度にし、6:4程度に余白が目立つ構図を作らないでください。
10. 図形内テキストが図形からはみ出していないか確認してください。長いファイル名や英字ラベルは `tspan` で分割し、左右20px以上の余白を残してください。
11. Marp配置時にスライド枠からSVGがはみ出しにくいよう、`SLIDES.md` の画像指定は個別サイズではなく `visual`、`visual-dense`、`visual-full` classのCSSで制御してください。inline SVGの場合も同様に、親classのcontainment(`--visual-max-height`系token)でサイズを制御してください。
12. 外部ファイル形式の場合は `SLIDES.md`の参照パスが実在するSVGを指すようにしてください。
13. render output の生成や表示品質の最終判定は行わず、source artifact の作成に集中してください。

**必須出力**
## Visual Result
- Status: generated / needs_input
- HTML visuals checked:
- SVG files: (外部ファイル形式・inline形式の両方を記載)
- Existing image references:
- Canvas usage checks:
- Text fit checks:
- Source reference checks:
- Design Contract checks:
- Files changed:
- Notes:

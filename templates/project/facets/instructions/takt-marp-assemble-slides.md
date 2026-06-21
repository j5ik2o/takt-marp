section sourceからMarp Markdownをassembleしてください。

**やること:**
1. `brief.normalized.md`、`plan.md`、`slide-blueprint.md`、`.takt/workflow-current-target.json`、marker の `design_contract.path` が指す Resolved Design Contract、`sections/manifest.md`、`sections/*.md` を読んでください。Resolved Design Contract の `guidance` と `source_catalog` も読み、plan / blueprint が選定した reusable element、sample、template、component prompt と矛盾しないように assemble してください。
2. marker の `design_contract.fingerprint.contract_sha256` と `plan.md` / `slide-blueprint.md` に記録された `contract_sha256` が一致することを確認してください。不一致の場合は `needs_input` とし、`SLIDES.md` を成功扱いで更新しないでください。
3. `SLIDES.md` をMarp形式で作成または更新してください。
4. front matter、theme、global style、deck-wide CSS tokenは `SLIDES.md` にだけ書いてください。section fileにはfront matterを残さないでください。
5. `sections/manifest.md` の順序でsection fileを連結し、slide IDが `S001` からplanned slide countまで欠落・重複なく並ぶことを確認してください。
6. section fileの先頭slideは `---` delimiterを持たないため、2つ目以降のsection fileを連結する直前には `---` delimiterを1つ挿入してください。ただしfront matter直後かつ最初のsection fileの前には追加delimiterを入れてはいけません。
7. `html:` visual または inline SVG を含む場合は、front matter に `html: true` を設定してください。
8. fontには Resolved Design Contract の brand fonts を優先し、不足時だけ日本語優先フォールバックスタック(例: `"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`)を指定してください。`@font-face` を宣言する場合は、`SLIDES.md` からの相対pathが実在するファイルのみを参照してください。pathが存在しない環境では `@font-face` を省略し、フォールバックスタックのみで描画してください。
9. `SLIDES.md` のCSSは Resolved Design Contract の token 名と値を保持し、raw color、raw px、未提供 font-family の新規混入を避けてください。sectionごとの個別 `font-size`、`line-height`、`margin`、`padding` の追加ではなく、CSS custom property と用途別classで構成してください。Design System の `guidance` / `source_catalog` に sample slide や template がある場合も、token と class の適用規約を優先し、特定 sample を固定的にコピーしないでください。
10. render output の生成や品質判定は行わず、source artifact のassemblyに集中してください。

**コンテキスト反映規約:**
- `brief.normalized.md` の `Event Context` の `Name`(イベント名)の値が「未指定」以外の場合は、タイトルスライドに反映されていることを確認してください。
- `Speaker Profile` 節の内容が「未指定」以外の場合は、自己紹介相当スライドに反映されていることを確認してください。
- 値が「未指定」の項目・節は反映せず、値を捏造・補完してはなりません。

**禁止事項**
- section fileの本文を再生成しないでください。assembly時に直せるのはfront matter、global style、区切り、明らかな連結ミスだけです。
- planの中心メッセージを変更しないでください。
- official delivery artifact や `.takt/render/` を成功条件にしないでください。
- approval file を生成しないでください。
- SVG markup(外部ファイル・inline両形式)と既存画像参照を書かないでください(generate_visualsが所有)。

**必須出力**
## Assemble Slides Result
- Status: assembled / needs_input
- Files changed:
- Section files assembled:
- Slide count:
- HTML visuals:
- Visual placeholders:
- Layout decisions:
- Design contract usage:
- Human review points:

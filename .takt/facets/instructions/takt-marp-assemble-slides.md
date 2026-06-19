section sourceからMarp Markdownをassembleしてください。

**やること:**
1. `brief.normalized.md`、`plan.md`、`slide-blueprint.md`、`design-system.md`、`sections/manifest.md`、`sections/*.md` を読んでください。
2. `SLIDES.md` をMarp形式で作成または更新してください。
3. front matter、theme、global style、deck-wide CSS tokenは `SLIDES.md` にだけ書いてください。section fileにはfront matterを残さないでください。
4. `sections/manifest.md` の順序でsection fileを連結し、slide IDが `S001` からplanned slide countまで欠落・重複なく並ぶことを確認してください。
5. section fileの先頭slideは `---` delimiterを持たないため、2つ目以降のsection fileを連結する直前には `---` delimiterを1つ挿入してください。ただしfront matter直後かつ最初のsection fileの前には追加delimiterを入れてはいけません。
6. `html:` visual または inline SVG を含む場合は、front matter に `html: true` を設定してください。
7. fontには日本語優先フォールバックスタック(例: `"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`)を必ず指定してください。`@font-face` を宣言する場合は、`SLIDES.md` からの相対pathが実在するファイルのみを参照してください。pathが存在しない環境では `@font-face` を省略し、フォールバックスタックのみで描画してください。
8. `SLIDES.md` のCSSは `design-system.md` のtokenに揃え、スライドごとの個別 `font-size`、`line-height`、`margin`、`padding` の追加を避けてください。
9. render output の生成や品質判定は行わず、source artifact のassemblyに集中してください。

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
- Design system usage:
- Human review points:

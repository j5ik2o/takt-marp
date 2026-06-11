承認済みのplanに沿ってMarp Markdownをcomposeしてください。

**やること:**
1. `brief.normalized.md`、`plan.md`、`design-system.md`を読んでください。
2. `SLIDES.md`をMarp形式で作成または更新してください。
3. 各スライドにspeaker notesを付けてください。`brief.normalized.md` の `Event Context` の `Duration` の値が「未指定」以外(分単位の数値)の場合は、各スライドのspeaker notes冒頭行に尺マーカー `【N分 / 累計 M:SS】` を書き、最終スライドの累計を発表時間と整合させてください。`Duration` が「未指定」の場合はマーカーを書かず、推測した時間を記載してはなりません。各スライドのspeaker notesには、聴衆に最も伝えるべき1点(強調点)を含めてください。
4. visual予定があるスライドには、planの `Visual:` 値に対応する placeholder(例: `<!-- Visual: svg: <ファイル名またはテーマ> -->`、`<!-- Visual: existing: <パス> -->`)を配置してください。SVG markup と画像参照の挿入(外部ファイル・inline・既存画像のすべて)は generate_visuals が所有します。
5. planの `Layout` と `design-system.md` に従い、Marp classとCSS tokenで表現してください。
6. `SLIDES.md` のCSSは `design-system.md` のtokenに揃え、スライドごとの個別 `font-size`、`line-height`、`margin`、`padding` の追加を避けてください。
7. render output の生成や品質判定は行わず、source artifact の作成に集中してください。

**コンテキスト反映規約:**
- `brief.normalized.md` の `Event Context` の `Name`(イベント名)の値が「未指定」以外の場合は、タイトルスライドに反映してください。
- `Speaker Profile` 節の内容が「未指定」以外の場合は、自己紹介相当スライドに反映してください。
- 値が「未指定」の項目・節は反映せず、値を捏造・補完してはなりません(節自体は contract 上常に存在します)。

**機械規約適合:**
- `SLIDES.md` 本文にHTML要素(inline SVG含む)を使う場合は、front matterに `html: true` を設定してください。
- fontには日本語優先フォールバックスタック(例: `"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`)を必ず指定してください。`@font-face` を宣言する場合は、`SLIDES.md` からの相対pathが実在するファイルのみを参照してください。pathが存在しない環境では `@font-face` を省略し、フォールバックスタックのみで描画してください。

**禁止事項**
- planの中心メッセージを変更しないでください。
- official delivery artifact や `.takt/render/` を成功条件にしないでください。
- approval file を生成しないでください。
- SVG markup(外部ファイル・inline両形式)を書かないでください(generate_visualsが所有)。
- 発表時間・イベント名・登壇者情報が「未指定」の場合、値を推測・捏造・補完しないでください。

**必須出力**
## Compose Slides Result
- Status: composed / needs_input
- Files changed:
- SVG placeholders:
- Layout decisions:
- Design system usage:
- Human review points:

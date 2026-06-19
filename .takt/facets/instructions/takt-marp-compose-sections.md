承認済みのplanとslide-blueprintから、章/節単位のMarp section sourceをcomposeしてください。

**やること:**
1. `brief.normalized.md`、`reference-analysis.md`、`plan.md`、`slide-blueprint.md`、`design-system.md`を読んでください。
2. `slides/<deck>/sections/manifest.md` を作成または更新してください。
3. `slide-blueprint.md` の Section Assembly Manifest に従い、`slides/<deck>/sections/*.md` を作成または更新してください。
4. 各section fileはfront matterなしのMarp本文断片にしてください。section fileの先頭slideは `---` delimiterで始めず、`<!-- slide_id: SNNN -->` から始めてください。2枚目以降のslideだけ `---` delimiterで区切り、各slideに `<!-- slide_id: SNNN -->` を入れてください。
5. 各スライドにspeaker notesを付けてください。`brief.normalized.md` の `Event Context` の `Duration` の値が「未指定」以外(分単位の数値)の場合は、各スライドのspeaker notes冒頭行に尺マーカー `【N分 / 累計 M:SS】` を書き、最終スライドの累計を発表時間と整合させてください。`Duration` が「未指定」の場合はマーカーを書かず、推測した時間を記載してはなりません。各スライドのspeaker notesには、聴衆に最も伝えるべき1点(強調点)を含めてください。
6. `brief.normalized.md` の `Event Context` の `Name` が「未指定」以外の場合は、title slide相当のsection本文に反映してください。`Speaker Profile` 節の内容が「未指定」以外の場合は、自己紹介相当slideまたはtitle slideのspeaker contextに反映してください。値が「未指定」の項目・節は反映せず、捏造・補完してはなりません。
7. `Visual: html: ...` のスライドは、section file内にHTML/CSS構造を直接書いてください。placeholderにしないでください。
8. `Visual: svg: ...` / `inline-svg: ...` / `existing: ...` のスライドは、section file内に `<!-- Visual: ... -->` placeholder を置いてください。SVG markup と既存画像参照は generate_visuals が所有します。
9. `Visual: none` のスライドにはvisual placeholderを置かないでください。
10. render output の生成や品質判定は行わず、source artifact の作成に集中してください。

**禁止事項**
- `SLIDES.md` を直接完成させないでください。SLIDES.md のfront matterとassemblyは assemble step が所有します。
- `slide-blueprint.md` の中心メッセージ、slide count、coverage、visual strategyを変更しないでください。
- HTML/CSSで十分なカード、2列比較、表、短い手順をSVG placeholderにしないでください。
- SVG markup(外部ファイル・inline両形式)と既存画像参照を書かないでください(generate_visualsが所有)。
- approval file を生成しないでください。

**必須出力**
## Compose Sections Result
- Status: composed / needs_input
- Section manifest:
- Section files:
- Slide count:
- HTML visuals:
- Visual placeholders:
- Files changed:
- Blocking issues:
